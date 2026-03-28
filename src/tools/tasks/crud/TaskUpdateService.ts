/**
 * Task Update Service
 * Handles task updates with field diffing and relationship management
 *
 * Note: Moving tasks between Kanban buckets requires the dedicated endpoint
 * POST /projects/{projectId}/views/{viewId}/buckets/{bucketId}/tasks
 * The regular task update does NOT support bucket_id for bucket moves.
 */

import { MCPError, ErrorCode } from '../../../types';
import { getClientFromContext } from '../../../client';
import type { Task, VikunjaClient } from 'node-vikunja';
import { validateDateString, validateId, convertRepeatConfiguration } from '../validation';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { RETRY_CONFIG } from '../../../utils/retry';
import { transformApiError, handleFetchError, handleStatusCodeError } from '../../../utils/error-handler';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { createTaskResponse } from './TaskResponseFormatter';
import { formatAorpAsMarkdown } from '../../../utils/response-factory';

export interface UpdateTaskArgs {
  id?: number;
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: number;
  done?: boolean;
  labels?: number[];
  assignees?: number[];
  repeatAfter?: number;
  repeatMode?: 'day' | 'week' | 'month' | 'year';
  /** Kanban bucket ID to move the task to (e.g. "To Do", "Doing", "Review", "Done") */
  bucketId?: number;
  // Session ID for AORP response tracking
  sessionId?: string;
}

/**
 * Internal interface for tracking update state and field changes
 */
interface UpdateState {
  currentTask: Task;
  previousState: Record<string, unknown>;
  affectedFields: string[];
}

/**
 * Updates a task with comprehensive field diffing and relationship management
 */
export async function updateTask(args: UpdateTaskArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for update operation');
    }
    validateId(args.id, 'id');

    // Validate date if provided
    if (args.dueDate) {
      validateDateString(args.dueDate, 'dueDate');
    }

    const client = await getClientFromContext();

    // Move to bucket first if requested (uses dedicated endpoint; task update with bucket_id does not work)
    if (args.bucketId !== undefined) {
      await moveTaskToBucket(client, args.id, args.bucketId);
    }

    // Analyze current state and track changes
    const updateState = await analyzeUpdateState(client, args.id, args);

    // Build and apply the update (bucketId handled above via dedicated endpoint; not sent in task update)
    const { bucketId: _b, ...argsForUpdate } = args;
    const updateData = buildUpdateData(updateState.currentTask, argsForUpdate);
    await client.tasks.updateTask(args.id, updateData);

    // Update labels if provided
    if (args.labels !== undefined) {
      await updateTaskLabels(client, args.id, args.labels);
    }

    // Update assignees if provided
    if (args.assignees !== undefined) {
      await updateTaskAssignees(client, args.id, args.assignees);
    }

    // Fetch the complete updated task
    const completeTask = await client.tasks.getTask(args.id);

    const response = createTaskResponse(
      'update-task',
      'Task updated successfully',
      { task: completeTask },
      {
        timestamp: new Date().toISOString(),
        affectedFields: updateState.affectedFields,
        previousState: updateState.previousState as Partial<Task>,
        taskId: args.id,
      },
      undefined, // verbosity (ignored - using standard AORP)
      undefined, // useOptimizedFormat (ignored - using standard AORP)
      undefined, // useAorp (ignored - always using AORP)
      undefined, // aorpConfig (using auto-generated)
      args.sessionId
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response.response),
        },
      ],
    };
  } catch (error) {
    // Re-throw MCPError instances without modification
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle fetch/connection errors with helpful guidance
    if (error instanceof Error && (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND')
    )) {
      throw handleFetchError(error, 'update task');
    }

    // Use standardized error transformation for all other errors
    if (args.id) {
      throw handleStatusCodeError(error, 'update task', args.id, `Task with ID ${args.id} not found`);
    }
    throw transformApiError(error, 'Failed to update task');
  }
}

/**
 * Analyzes the current task state and determines which fields are being updated
 */
async function analyzeUpdateState(client: VikunjaClient, taskId: number, args: UpdateTaskArgs): Promise<UpdateState> {
  // Fetch the current task to preserve all fields and track changes
  const currentTask = await client.tasks.getTask(taskId);
  const previousState: Record<string, unknown> = {};
  if (currentTask.title !== undefined) previousState.title = currentTask.title;
  if (currentTask.description !== undefined) previousState.description = currentTask.description;
  if (currentTask.due_date !== undefined) previousState.due_date = currentTask.due_date;
  if (currentTask.priority !== undefined) previousState.priority = currentTask.priority;
  if (currentTask.done !== undefined) previousState.done = currentTask.done;
  if (currentTask.repeat_after !== undefined) previousState.repeat_after = currentTask.repeat_after;
  if (currentTask.repeat_mode !== undefined) previousState.repeat_mode = currentTask.repeat_mode;
  const bucketId = (currentTask as { bucket_id?: number }).bucket_id;
  if (bucketId !== undefined) previousState.bucket_id = bucketId;

  // Track which fields are being updated
  const affectedFields: string[] = [];

  if (args.title !== undefined && args.title !== currentTask.title) affectedFields.push('title');
  if (args.description !== undefined && args.description !== currentTask.description) affectedFields.push('description');
  if (args.dueDate !== undefined && args.dueDate !== currentTask.due_date) affectedFields.push('dueDate');
  if (args.priority !== undefined && args.priority !== currentTask.priority) affectedFields.push('priority');
  if (args.done !== undefined && args.done !== currentTask.done) affectedFields.push('done');
  if (args.repeatAfter !== undefined && args.repeatAfter !== currentTask.repeat_after) affectedFields.push('repeatAfter');
  if (args.repeatMode !== undefined && args.repeatMode !== currentTask.repeat_mode) affectedFields.push('repeatMode');
  if (args.labels !== undefined) affectedFields.push('labels');
  if (args.assignees !== undefined) affectedFields.push('assignees');
  if (args.bucketId !== undefined) affectedFields.push('bucketId');

  return {
    currentTask,
    previousState,
    affectedFields
  };
}

/**
 * Builds the update data object by merging current task data with updates
 * This prevents the API from clearing fields that aren't explicitly updated
 */
function buildUpdateData(currentTask: Task, args: UpdateTaskArgs): Task {
  const updateData: Task = {
    ...currentTask,
    // Override with any provided updates
    ...(args.title !== undefined && { title: args.title }),
    ...(args.description !== undefined && { description: args.description }),
    ...(args.dueDate !== undefined && { due_date: args.dueDate }),
    ...(args.priority !== undefined && { priority: args.priority }),
    ...(args.done !== undefined && { done: args.done }),
    // Handle repeat configuration for updates
    ...(args.repeatAfter !== undefined || args.repeatMode !== undefined
      ? ((): Record<string, unknown> => {
          const repeatConfig = convertRepeatConfiguration(
            args.repeatAfter !== undefined ? args.repeatAfter : currentTask.repeat_after,
            args.repeatMode !== undefined ? args.repeatMode : undefined,
          );
          const updates: Record<string, unknown> = {};
          if (repeatConfig.repeat_after !== undefined)
            updates.repeat_after = repeatConfig.repeat_after;
          if (repeatConfig.repeat_mode !== undefined) updates.repeat_mode = repeatConfig.repeat_mode;
          return updates;
        })()
      : {}),
  };

  return updateData;
}

/**
 * Moves a task to a Kanban bucket using the dedicated endpoint.
 * POST /projects/{projectId}/views/{viewId}/buckets/{bucketId}/tasks
 * Body: { task_id }
 */
async function moveTaskToBucket(client: VikunjaClient, taskId: number, bucketId: number): Promise<void> {
  const task = await client.tasks.getTask(taskId);
  const projectId = task.project_id;
  if (!projectId) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task has no project_id; cannot move to bucket');
  }

  const projectsService = client.projects as unknown as { request: (endpoint: string, method: string, body?: unknown) => Promise<unknown> };
  const views = await projectsService.request(`/projects/${projectId}/views`, 'GET') as Array<{ id: number; view_kind?: string }>;
  const kanbanView = views.find((v) => v.view_kind === 'kanban' || v.view_kind === 'board');
  if (!kanbanView?.id) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `Project ${projectId} has no Kanban view`);
  }

  await projectsService.request(
    `/projects/${projectId}/views/${kanbanView.id}/buckets/${bucketId}/tasks`,
    'POST',
    { task_id: taskId }
  );
}

/**
 * Updates task labels with authentication error handling
 */
async function updateTaskLabels(client: VikunjaClient, taskId: number, labelIds: number[]): Promise<void> {
  try {
    await client.tasks.updateTaskLabels(taskId, {
      label_ids: labelIds,
    });
  } catch (labelError) {
    // Check if it's an auth error
    if (isAuthenticationError(labelError)) {
      throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_UPDATE);
    }
    throw labelError;
  }
}

/**
 * Updates task assignees with diff calculation and authentication error handling
 */
async function updateTaskAssignees(client: VikunjaClient, taskId: number, newAssigneeIds: number[]): Promise<void> {
  try {
    // Get current assignees to calculate diff
    const currentTask = await client.tasks.getTask(taskId);
    const currentAssigneeIds = currentTask.assignees?.map((a) => a.id) || [];

    // Calculate which assignees to add and remove
    const toAdd = newAssigneeIds.filter((id: number) => !currentAssigneeIds.includes(id));
    const toRemove = currentAssigneeIds.filter((id: number) => !newAssigneeIds.includes(id));

    // Add new assignees first to avoid leaving task unassigned if removal fails
    if (toAdd.length > 0) {
      await client.tasks.bulkAssignUsersToTask(taskId, {
        user_ids: toAdd,
      });
    }

    // Remove old assignees only after new ones are successfully added
    for (const userId of toRemove) {
      try {
        await client.tasks.removeUserFromTask(taskId, userId);
      } catch (removeError) {
        // Check if it's an auth error on remove
        if (isAuthenticationError(removeError)) {
          throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE_PARTIAL);
        }
        throw removeError;
      }
    }
  } catch (assigneeError) {
    // Check if it's an auth error after retries
    if (isAuthenticationError(assigneeError)) {
      throw new MCPError(
        ErrorCode.API_ERROR,
        `${AUTH_ERROR_MESSAGES.ASSIGNEE_UPDATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
      );
    }
    throw assigneeError;
  }
}