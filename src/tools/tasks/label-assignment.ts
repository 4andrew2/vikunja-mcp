/**
 * Label assignment helpers: payload shaping for task updates, merge semantics, and post-assignment verification.
 */

import type { Label, Task, VikunjaClient } from 'node-vikunja';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, AUTH_RETRY_NO_SHARED_BREAKER } from '../../utils/retry';

const labelOpRetry = {
  ...AUTH_RETRY_NO_SHARED_BREAKER,
  shouldRetry: (error: unknown): boolean => isAuthenticationError(error),
};

/** Relation and nested fields Vikunja does not persist via generic POST /tasks/{id}; use dedicated endpoints instead. */
const TASK_UPDATE_RELATION_KEYS = [
  'labels',
  'assignees',
  'related_tasks',
  'attachments',
  'reminders',
  'reactions',
] as const;

/**
 * Returns a shallow copy of the task without relation blobs so POST /tasks/{id} is less likely to fail or confuse the API.
 */
export function stripTaskRelationFieldsForUpdate(task: Task): Task {
  const strip = new Set<string>(TASK_UPDATE_RELATION_KEYS);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(task as Record<string, unknown>)) {
    if (!strip.has(k)) {
      out[k] = v;
    }
  }
  return out as Task;
}

/**
 * Merges requested label IDs with labels already on the task (additive). Preserves existing order, then appends new IDs.
 */
export function mergeLabelIdsForUpdate(currentTask: Task, requestedLabelIds: number[]): number[] {
  const existing =
    currentTask.labels?.map((l: Label) => l.id).filter((id): id is number => id !== undefined) ?? [];
  const merged = [...existing];
  for (const id of requestedLabelIds) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

export function taskContainsAllLabelIds(task: Task | null | undefined, expectedIds: number[]): boolean {
  if (expectedIds.length === 0) {
    return true;
  }
  if (!task?.labels || !Array.isArray(task.labels)) {
    return false;
  }
  const assigned = task.labels.map((l: Label) => l.id);
  return expectedIds.every((id) => assigned.includes(id));
}

/**
 * Re-fetches the task and checks that every expected label ID is present (detects silent API-token failures).
 */
export async function verifyTaskLabelAssignment(
  client: VikunjaClient,
  taskId: number,
  expectedLabelIds: number[],
): Promise<boolean> {
  try {
    const t = await client.tasks.getTask(taskId);
    return taskContainsAllLabelIds(t, expectedLabelIds);
  } catch {
    return false;
  }
}

/**
 * Sets a task's labels to exactly `targetLabelIds` using PUT/DELETE per label.
 * Prefer this over POST `/tasks/{id}/labels/bulk` so API tokens (`tk_*`) behave like the web UI
 * (bulk replace is known to report success without persisting for some token setups).
 */
export async function syncTaskLabelsToTarget(
  client: VikunjaClient,
  taskId: number,
  targetLabelIds: number[],
): Promise<void> {
  const task = await client.tasks.getTask(taskId);
  const currentIds =
    task.labels?.map((l: Label) => l.id).filter((id): id is number => id !== undefined) ?? [];
  const target = [...new Set(targetLabelIds)];
  const currentSet = new Set(currentIds);
  const targetSet = new Set(target);

  const toRemove = currentIds.filter((id) => !targetSet.has(id));
  const toAdd = target.filter((id) => !currentSet.has(id));

  for (const labelId of toRemove) {
    await withRetry(() => client.tasks.removeLabelFromTask(taskId, labelId), labelOpRetry);
  }
  for (const labelId of toAdd) {
    await withRetry(
      () =>
        client.tasks.addLabelToTask(taskId, {
          task_id: taskId,
          label_id: labelId,
        }),
      labelOpRetry,
    );
  }
}
