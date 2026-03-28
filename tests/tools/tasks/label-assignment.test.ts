import type { Task } from 'node-vikunja';
import {
  mergeLabelIdsForUpdate,
  stripTaskRelationFieldsForUpdate,
  syncTaskLabelsToTarget,
  taskContainsAllLabelIds,
  verifyTaskLabelAssignment,
} from '../../../src/tools/tasks/label-assignment';

describe('label-assignment helpers', () => {
  describe('stripTaskRelationFieldsForUpdate', () => {
    it('removes relation keys from a shallow copy', () => {
      const task = {
        id: 1,
        title: 'T',
        project_id: 1,
        labels: [{ id: 1, title: 'a' }],
        assignees: [{ id: 2, username: 'u' }],
        related_tasks: [],
        attachments: [],
        reminders: [],
        reactions: [],
      } as unknown as Task;

      const stripped = stripTaskRelationFieldsForUpdate(task);
      expect(stripped.labels).toBeUndefined();
      expect(stripped.assignees).toBeUndefined();
      expect((stripped as Record<string, unknown>).related_tasks).toBeUndefined();
      expect(task.labels).toHaveLength(1);
    });
  });

  describe('mergeLabelIdsForUpdate', () => {
    it('merges new ids after existing without duplicates', () => {
      const task = {
        id: 1,
        title: 'T',
        project_id: 1,
        labels: [{ id: 3, title: 'x' }],
      } as unknown as Task;
      expect(mergeLabelIdsForUpdate(task, [1, 3])).toEqual([3, 1]);
    });

    it('handles missing labels', () => {
      const task = { id: 1, title: 'T', project_id: 1 } as Task;
      expect(mergeLabelIdsForUpdate(task, [2])).toEqual([2]);
    });
  });

  describe('taskContainsAllLabelIds', () => {
    it('returns true for empty expected', () => {
      expect(taskContainsAllLabelIds(undefined, [])).toBe(true);
    });

    it('returns false when labels missing', () => {
      expect(taskContainsAllLabelIds({ id: 1 } as Task, [1])).toBe(false);
    });

    it('returns true when all ids present', () => {
      const task = {
        id: 1,
        labels: [{ id: 1 }, { id: 2 }],
      } as unknown as Task;
      expect(taskContainsAllLabelIds(task, [2, 1])).toBe(true);
    });
  });

  describe('syncTaskLabelsToTarget', () => {
    it('calls addLabelToTask once per missing id with distinct label_id (real withRetry)', async () => {
      const addLabelToTask = jest.fn().mockResolvedValue({});
      const removeLabelFromTask = jest.fn().mockResolvedValue({});
      const client = {
        tasks: {
          getTask: jest.fn().mockResolvedValue({ id: 1, project_id: 1, labels: [] }),
          addLabelToTask,
          removeLabelFromTask,
        },
      };
      await syncTaskLabelsToTarget(client as never, 1, [1, 2]);
      expect(addLabelToTask).toHaveBeenCalledTimes(2);
      expect(addLabelToTask).toHaveBeenNthCalledWith(1, 1, { task_id: 1, label_id: 1 });
      expect(addLabelToTask).toHaveBeenNthCalledWith(2, 1, { task_id: 1, label_id: 2 });
    });
  });

  describe('verifyTaskLabelAssignment', () => {
    it('returns true when getTask includes expected ids', async () => {
      const client = {
        tasks: {
          getTask: jest.fn().mockResolvedValue({
            id: 1,
            labels: [{ id: 1 }, { id: 2 }],
          }),
        },
      };
      await expect(verifyTaskLabelAssignment(client as never, 1, [1, 2])).resolves.toBe(true);
    });

    it('returns false when getTask throws', async () => {
      const client = {
        tasks: {
          getTask: jest.fn().mockRejectedValue(new Error('network')),
        },
      };
      await expect(verifyTaskLabelAssignment(client as never, 1, [1])).resolves.toBe(false);
    });
  });
});
