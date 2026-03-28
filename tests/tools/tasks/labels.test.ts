import { applyLabels, removeLabels, listTaskLabels } from '../../../src/tools/tasks/labels';
import { getClientFromContext } from '../../../src/client';
import { MCPError } from '../../../src/types/index';

// Mock the client
jest.mock('../../../src/client');

// Mock withRetry to call the operation directly without circuit breaker caching
jest.mock('../../../src/utils/retry', () => ({
  ...jest.requireActual('../../../src/utils/retry'),
  withRetry: async <T>(operation: () => Promise<T>) => operation(),
}));
const mockGetClientFromContext = jest.mocked(getClientFromContext);

describe('Label operations', () => {
  const mockClient = {
    tasks: {
      addLabelToTask: jest.fn(),
      removeLabelFromTask: jest.fn(),
      getTask: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockGetClientFromContext.mockResolvedValue(mockClient as any);
    mockClient.tasks.addLabelToTask.mockResolvedValue({ task_id: 1, label_id: 1 } as any);
    mockClient.tasks.removeLabelFromTask.mockResolvedValue({} as any);
  });

  describe('applyLabels', () => {
    it('should apply labels to a task successfully', async () => {
      const mockTask = {
        id: 1,
        title: 'Test Task',
        labels: [{ id: 1, title: 'research', hex_color: '3498db' }],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] })
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] })
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockTask);

      const result = await applyLabels({ id: 1, labels: [1] });

      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, {
        task_id: 1,
        label_id: 1,
      });
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
      expect(result.content[0].text).toContain('Label applied to task successfully');
    });

    it('should throw error if task id is missing', async () => {
      await expect(applyLabels({ labels: [1] })).rejects.toThrow(MCPError);
      await expect(applyLabels({ labels: [1] })).rejects.toThrow(
        'Task id is required for apply-label operation',
      );
    });

    it('should throw error if labels array is empty', async () => {
      await expect(applyLabels({ id: 1, labels: [] })).rejects.toThrow(MCPError);
    });

    it('should handle multiple labels', async () => {
      const mockTask = {
        id: 1,
        title: 'Test Task',
        labels: [
          { id: 1, title: 'a' },
          { id: 2, title: 'b' },
        ],
      };
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] })
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] })
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockTask);

      const result = await applyLabels({ id: 1, labels: [1, 2] });

      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, { task_id: 1, label_id: 1 });
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, { task_id: 1, label_id: 2 });
      expect(result.content[0].text).toContain('Labels applied to task successfully');
    });

    it('should merge with existing labels on the task', async () => {
      const afterApply = {
        id: 1,
        title: 'Test Task',
        labels: [
          { id: 3, title: 'existing' },
          { id: 1, title: 'new' },
        ],
      };
      mockClient.tasks.getTask
        .mockResolvedValueOnce({
          id: 1,
          title: 'Test Task',
          labels: [{ id: 3, title: 'existing' }],
        })
        .mockResolvedValueOnce({
          id: 1,
          title: 'Test Task',
          labels: [{ id: 3, title: 'existing' }],
        })
        .mockResolvedValueOnce(afterApply)
        .mockResolvedValueOnce(afterApply);

      await applyLabels({ id: 1, labels: [1] });

      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, {
        task_id: 1,
        label_id: 1,
      });
    });

    it('should handle API errors gracefully', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'T', labels: [] });
      mockClient.tasks.addLabelToTask.mockRejectedValue(new Error('API Error'));

      await expect(applyLabels({ id: 1, labels: [1] })).rejects.toThrow(MCPError);
    });

    it('should throw when verification fails after successful API call', async () => {
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] })
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] })
        .mockResolvedValueOnce({ id: 1, title: 'Test Task', labels: [] });
      mockClient.tasks.addLabelToTask.mockResolvedValue({ task_id: 1, label_id: 1 } as any);

      await expect(applyLabels({ id: 1, labels: [1] })).rejects.toThrow(MCPError);
    });
  });

  describe('removeLabels', () => {
    it('should remove labels from a task successfully', async () => {
      const mockTask = { id: 1, title: 'Test Task', labels: [] };
      mockClient.tasks.getTask
        .mockResolvedValueOnce({
          id: 1,
          title: 'Test Task',
          labels: [{ id: 1, title: 'x' }],
        })
        .mockResolvedValueOnce({
          id: 1,
          title: 'Test Task',
          labels: [{ id: 1, title: 'x' }],
        })
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(mockTask);

      const result = await removeLabels({ id: 1, labels: [1] });

      expect(mockClient.tasks.removeLabelFromTask).toHaveBeenCalledWith(1, 1);
      expect(result.content[0].text).toContain('Label removed from task successfully');
    });

    it('should throw error if task id is missing', async () => {
      await expect(removeLabels({ labels: [1] })).rejects.toThrow(MCPError);
    });

    it('should throw error if labels array is empty', async () => {
      await expect(removeLabels({ id: 1, labels: [] })).rejects.toThrow(MCPError);
    });

    it('should handle multiple labels removal', async () => {
      const afterRemove = {
        id: 1,
        title: 'Test Task',
        labels: [{ id: 3, title: 'c' }],
      };
      mockClient.tasks.getTask
        .mockResolvedValueOnce({
          id: 1,
          title: 'Test Task',
          labels: [
            { id: 1, title: 'a' },
            { id: 2, title: 'b' },
            { id: 3, title: 'c' },
          ],
        })
        .mockResolvedValueOnce({
          id: 1,
          title: 'Test Task',
          labels: [
            { id: 1, title: 'a' },
            { id: 2, title: 'b' },
            { id: 3, title: 'c' },
          ],
        })
        .mockResolvedValueOnce(afterRemove)
        .mockResolvedValueOnce(afterRemove);

      const result = await removeLabels({ id: 1, labels: [1, 2] });

      expect(mockClient.tasks.removeLabelFromTask).toHaveBeenCalledWith(1, 1);
      expect(mockClient.tasks.removeLabelFromTask).toHaveBeenCalledWith(1, 2);
      expect(result.content[0].text).toContain('Labels removed from task successfully');
    });
  });

  describe('listTaskLabels', () => {
    it('should list labels for a task successfully', async () => {
      const mockTask = {
        id: 1,
        title: 'Test Task',
        labels: [{ id: 1, title: 'research', hex_color: '3498db' }],
      };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await listTaskLabels({ id: 1 });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
      expect(result.content[0].text).toContain('Task has 1 label(s)');
    });

    it('should throw error if task id is missing', async () => {
      await expect(listTaskLabels({})).rejects.toThrow(MCPError);
    });

    it('should handle task with no labels', async () => {
      const mockTask = { id: 1, title: 'Test Task', labels: [] };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await listTaskLabels({ id: 1 });

      expect(result.content[0].text).toContain('Task has 0 label(s)');
    });

    it('should handle undefined task id', async () => {
      await expect(listTaskLabels({ id: undefined })).rejects.toThrow(MCPError);
    });
  });
});
