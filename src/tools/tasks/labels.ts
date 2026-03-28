/**
 * Label operations for tasks
 */

import type { Label } from 'node-vikunja';
import type { MinimalTask } from '../../types';
import { MCPError, ErrorCode } from '../../types';
import { getClientFromContext } from '../../client';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { AUTH_ERROR_MESSAGES } from './constants';
import { mergeLabelIdsForUpdate, syncTaskLabelsToTarget, verifyTaskLabelAssignment } from './label-assignment';
import { validateId } from './validation';
import { createSimpleResponse, formatAorpAsMarkdown } from '../../utils/response-factory';

/**
 * Add labels to a task
 */
export async function applyLabels(args: {
  id?: number;
  labels?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.id) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Task id is required for apply-label operation',
    );
  }
  validateId(args.id, 'id');

  if (!args.labels || args.labels.length === 0) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'At least one label id is required');
  }

  args.labels.forEach((id) => validateId(id, 'label ID'));

  const client = await getClientFromContext();
  const taskId = args.id;
  const requestedIds = args.labels;

  try {
    const current = await client.tasks.getTask(taskId);
    const mergedIds = mergeLabelIdsForUpdate(current, requestedIds);

    await syncTaskLabelsToTarget(client, taskId, mergedIds);

    const verified = await verifyTaskLabelAssignment(client, taskId, mergedIds);
    if (!verified) {
      throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_VERIFY_FAILED);
    }

    const task = await client.tasks.getTask(args.id);

    const response = createSimpleResponse(
      'apply-label',
      `Label${requestedIds.length > 1 ? 's' : ''} applied to task successfully`,
      { task },
      { metadata: { affectedFields: ['labels'] } },
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    if (isAuthenticationError(error)) {
      throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_UPDATE);
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to apply labels to task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Remove labels from a task
 */
export async function removeLabels(args: {
  id?: number;
  labels?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.id) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Task id is required for remove-label operation',
    );
  }
  validateId(args.id, 'id');

  if (!args.labels || args.labels.length === 0) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'At least one label id is required to remove');
  }

  args.labels.forEach((id) => validateId(id, 'label ID'));

  const client = await getClientFromContext();
  const taskId = args.id;
  const labelIdsToRemove = args.labels;

  try {
    const current = await client.tasks.getTask(taskId);
    const existing =
      current.labels?.map((l: Label) => l.id).filter((id): id is number => id !== undefined) ?? [];
    const removeSet = new Set(labelIdsToRemove);
    const remaining = existing.filter((id) => !removeSet.has(id));

    await syncTaskLabelsToTarget(client, taskId, remaining);

    const verified = await verifyTaskLabelAssignment(client, taskId, remaining);
    if (!verified) {
      throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_VERIFY_FAILED);
    }

    const task = await client.tasks.getTask(args.id);

    const response = createSimpleResponse(
      'remove-label',
      `Label${labelIdsToRemove.length > 1 ? 's' : ''} removed from task successfully`,
      { task },
      { metadata: { affectedFields: ['labels'] } },
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    if (isAuthenticationError(error)) {
      throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_UPDATE);
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to remove labels from task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * List labels of a task
 */
export async function listTaskLabels(args: {
  id?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (args.id === undefined) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-labels operation',
      );
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

    // Fetch the task to get current labels
    const task = await client.tasks.getTask(args.id);

    const labels = task.labels || [];

    const minimalTask: MinimalTask = {
      ...(task.id !== undefined && { id: task.id }),
      title: task.title,
    };

    const response = createSimpleResponse(
      'list-labels',
      `Task has ${labels.length} label(s)`,
      { task: { ...minimalTask, labels: labels } },
      { metadata: { count: labels.length } },
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list task labels: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
