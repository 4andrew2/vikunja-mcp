/**
 * Tests for simple-response task formatting
 * Ensures tasks are displayed with useful information
 */

import { formatSuccessMessage, createSuccessResponse, createErrorResponse } from '../../src/utils/simple-response';
import type { Task, Label } from '../../src/types/vikunja';

describe('simple-response - Task Formatting', () => {
  describe('formatSuccessMessage with tasks', () => {
    it('should format task with all fields', () => {
      const task: Task = {
        id: 1,
        project_id: 5,
        title: 'Fix critical bug',
        description: 'Users cannot login',
        done: false,
        priority: 5,
        due_date: '2025-01-30T17:00:00Z',
        percent_done: 25,
        labels: [
          { id: 1, title: 'urgent', hex_color: '#ff0000' }
        ],
        assignees: [
          { id: 1, username: 'johndoe', email: 'john@example.com' }
        ],
        repeat_after: 0,
        created: '2025-01-28T10:00:00Z',
        updated: '2025-01-28T14:30:00Z'
      };

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 1 task',
        { tasks: [task] },
        { count: 1 }
      );

      expect(result).toContain('Fix critical bug');
      expect(result).toContain('(ID: 1)');
      expect(result).toContain('❌ Not Done');
      expect(result).toContain('⭐⭐⭐⭐⭐ (5/5)');
      expect(result).toContain('**Due:**');
      expect(result).toContain('2025-01-30T17:00:00Z');
      expect(result).toContain('**Progress:**');
      expect(result).toContain('25%');
      expect(result).toContain('**Project:**');
      expect(result).toContain('**Labels:**');
      expect(result).toContain('urgent');
      expect(result).toContain('**Assignees:**');
      expect(result).toContain('johndoe');
      expect(result).toContain('**Description:**');
      expect(result).toContain('Users cannot login');
    });

    it('should format task with minimal fields', () => {
      const task: Task = {
        id: 2,
        project_id: 5,
        title: 'Simple task',
        done: true,
        repeat_after: 0
      };

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 1 task',
        { tasks: [task] },
        { count: 1 }
      );

      expect(result).toContain('Simple task');
      expect(result).toContain('(ID: 2)');
      expect(result).toContain('✅ Done');
      // Should not show priority if not set
      expect(result).not.toContain('Priority:');
    });

    it('should format multiple tasks', () => {
      const tasks: Task[] = [
        {
          id: 1,
          project_id: 5,
          title: 'Task 1',
          description: 'First task',
          done: false,
          priority: 5,
          due_date: '2025-01-30T17:00:00Z',
          repeat_after: 0
        },
        {
          id: 2,
          project_id: 5,
          title: 'Task 2',
          done: true,
          priority: 2,
          labels: [{ id: 1, title: 'low-priority' }],
          assignees: [{ id: 2, username: 'user2' }],
          repeat_after: 0
        }
      ];

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 2 tasks',
        { tasks: tasks },
        { count: 2 }
      );

      // First task
      expect(result).toContain('### 1. **Task 1**');
      expect(result).toContain('**Description:**');
      expect(result).toContain('First task');
      expect(result).toContain('⭐⭐⭐⭐⭐ (5/5)');

      // Second task
      expect(result).toContain('### 2. **Task 2**');
      expect(result).toContain('✅ Done');
      expect(result).toContain('⭐⭐ (2/5)');
      expect(result).toContain('**Labels:**');
      expect(result).toContain('low-priority');
      expect(result).toContain('**Assignees:**');
      expect(result).toContain('user2');
    });

    it('should format task with multiple assignees', () => {
      const task: Task = {
        id: 1,
        project_id: 5,
        title: 'Team task',
        done: false,
        assignees: [
          { id: 1, username: 'alice', email: 'alice@example.com' },
          { id: 2, username: 'bob', email: 'bob@example.com' },
          { id: 3, username: 'charlie' } // No email
        ],
        repeat_after: 0
      };

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 1 task',
        { tasks: [task] },
        { count: 1 }
      );

      expect(result).toContain('**Assignees:**');
      expect(result).toContain('alice (alice@example.com)');
      expect(result).toContain('bob (bob@example.com)');
      expect(result).toContain('charlie');
    });

    it('should format task with multiple labels', () => {
      const task: Task = {
        id: 1,
        project_id: 5,
        title: 'Labeled task',
        done: false,
        labels: [
          { id: 1, title: 'urgent', hex_color: '#ff0000' },
          { id: 2, title: 'bug', hex_color: '#ff6600' },
          { id: 3, title: 'frontend', hex_color: '#0066ff' }
        ],
        repeat_after: 0
      };

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 1 task',
        { tasks: [task] },
        { count: 1 }
      );

      expect(result).toContain('**Labels:**');
      expect(result).toContain('urgent');
      expect(result).toContain('bug');
      expect(result).toContain('frontend');
    });

    it('should not display fields when they are falsy', () => {
      const task: Task = {
        id: 1,
        project_id: 5,
        title: 'Minimal task',
        done: false,
        priority: 0, // Zero priority
        percent_done: 0, // Zero progress
        repeat_after: 0
      };

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 1 task',
        { tasks: [task] },
        { count: 1 }
      );

      expect(result).toContain('Minimal task');
      expect(result).toContain('❌ Not Done');
      expect(result).not.toContain('Priority:');
      expect(result).not.toContain('Progress:');
    });
  });

  describe('formatSuccessMessage with non-task items', () => {
    it('should format generic items with title', () => {
      const items = [
        { id: 1, title: 'Generic Item 1' },
        { id: 2, title: 'Generic Item 2' }
      ];

      const result = formatSuccessMessage(
        'list-items',
        'Found 2 items',
        { items },
        { count: 2 }
      );

      expect(result).toContain('1. **Generic Item 1** (ID: 1)');
      expect(result).toContain('2. **Generic Item 2** (ID: 2)');
    });

    it('should format generic items with name', () => {
      const items = [
        { id: 1, name: 'Named Item' }
      ];

      const result = formatSuccessMessage(
        'list-items',
        'Found 1 item',
        { items },
        { count: 1 }
      );

      expect(result).toContain('1. **Named Item** (ID: 1)');
    });

    it('should format items without id, title, or name', () => {
      const items = [
        { foo: 'bar', baz: 'qux' }
      ];

      const result = formatSuccessMessage(
        'list-items',
        'Found 1 item',
        { items },
        { count: 1 }
      );

      // When no id/title/name, it uses the entire object as the title
      expect(result).toContain('1. **');
      expect(result).toContain('"foo":"bar"');
      expect(result).toContain('"baz":"qux"');
    });

    it('should format project items', () => {
      const projects = [
        { id: 1, name: 'Project Alpha', description: 'First project' },
        { id: 2, name: 'Project Beta', description: 'Second project' }
      ];

      const result = formatSuccessMessage(
        'list-projects',
        'Found 2 projects',
        { projects },
        { count: 2 }
      );

      expect(result).toContain('1. **Project Alpha** (ID: 1)');
      expect(result).toContain('2. **Project Beta** (ID: 2)');
    });

    it('should format label items with hex_color', () => {
      const labels: Label[] = [
        { id: 1, title: 'urgent', hex_color: '#ff0000' },
        { id: 2, title: 'bug', hex_color: '#ff6600', description: 'Software defect' }
      ];

      const result = formatSuccessMessage(
        'list-labels',
        'Found 2 labels',
        { labels },
        { count: 2 }
      );

      expect(result).toContain('1. **urgent** (ID: 1) [#ff0000]');
      expect(result).toContain('2. **bug** (ID: 2) [#ff6600] — Software defect');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create response with tasks', () => {
      const task: Task = {
        id: 1,
        project_id: 5,
        title: 'Test task',
        done: false,
        priority: 3,
        repeat_after: 0
      };

      const response = createSuccessResponse(
        'get-task',
        'Task retrieved',
        { tasks: [task] },
        { taskId: 1 }
      );

      expect(response.content).toContain('Test task');
      expect(response.content).toContain('(ID: 1)');
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.success).toBe(true);
      expect(response.metadata?.operation).toBe('get-task');
      expect(response.metadata?.taskId).toBe(1);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response', () => {
      const response = createErrorResponse(
        'delete-task',
        'Task not found',
        'NOT_FOUND',
        { taskId: 999 }
      );

      expect(response.content).toContain('❌ Error');
      expect(response.content).toContain('Task not found');
      expect(response.content).toContain('NOT_FOUND');
      expect(response.metadata?.success).toBe(false);
      expect(response.metadata?.error).toBeDefined();
      expect(response.metadata?.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty array', () => {
      const result = formatSuccessMessage(
        'list-tasks',
        'No tasks found',
        { tasks: [] },
        { count: 0 }
      );

      expect(result).toContain('**Results:**');
      expect(result).toContain('0 item(s)');
    });

    it('should display all items in compact format when > 10', () => {
      const tasks: Task[] = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        project_id: 1,
        title: `Task ${i + 1}`,
        done: i % 2 === 0,
        priority: i % 3,
        repeat_after: 0
      }));

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 15 tasks',
        { tasks },
        { count: 15 }
      );

      expect(result).toContain('**Results:**');
      expect(result).toContain('15 item(s)');
      // Items should be displayed in compact format (no ### headers)
      expect(result).toContain('**Task 1**');
      expect(result).toContain('**Task 15**');
      expect(result).not.toContain('### 1.');
      // Compact format includes status emoji
      expect(result).toContain('✅');
      expect(result).toContain('❌');
    });

    it('should truncate description in compact format', () => {
      const longDesc = 'A'.repeat(200);
      const tasks: Task[] = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        project_id: 1,
        title: `Task ${i + 1}`,
        description: i === 0 ? longDesc : undefined,
        done: false,
        repeat_after: 0
      }));

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 12 tasks',
        { tasks },
        { count: 12 }
      );

      // Description should be truncated to 100 chars with ellipsis
      expect(result).toContain('A'.repeat(100) + '…');
      expect(result).not.toContain('A'.repeat(200));
    });

    it('should handle exactly 10 items with rich format', () => {
      const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        project_id: 1,
        title: `Task ${i + 1}`,
        done: false,
        repeat_after: 0
      }));

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 10 tasks',
        { tasks },
        { count: 10 }
      );

      expect(result).toContain('**Results:**');
      expect(result).toContain('10 item(s)');
      // Items should be displayed in rich format when <= 10
      expect(result).toContain('### 1.');
      expect(result).toContain('Task 1');
      expect(result).toContain('### 10.');
      expect(result).toContain('Task 10');
    });

    it('should show bucket_id in rich task format', () => {
      const task: Task = {
        id: 1,
        project_id: 5,
        title: 'Kanban task',
        done: false,
        bucket_id: 42,
        repeat_after: 0
      };

      const result = formatSuccessMessage(
        'get-task',
        'Task retrieved',
        { tasks: [task] },
        { count: 1 }
      );

      expect(result).toContain('**Bucket:** 42');
    });

    it('should show bucket_id in compact task format', () => {
      const tasks: Task[] = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        project_id: 1,
        title: `Task ${i + 1}`,
        done: false,
        bucket_id: 7,
        repeat_after: 0
      }));

      const result = formatSuccessMessage(
        'list-tasks',
        'Found 12 tasks',
        { tasks },
        { count: 12 }
      );

      expect(result).toContain('bucket:7');
    });

    it('should format many labels with hex_color', () => {
      const labels: Label[] = Array.from({ length: 18 }, (_, i) => ({
        id: i + 1,
        title: `Label ${i + 1}`,
        hex_color: `#${String(i).padStart(6, '0')}`
      }));

      const result = formatSuccessMessage(
        'list-labels',
        'Found 18 labels',
        { labels },
        { count: 18 }
      );

      expect(result).toContain('18 item(s)');
      expect(result).toContain('**Label 1** (ID: 1)');
      expect(result).toContain('**Label 18** (ID: 18)');
      expect(result).toContain('[#000000]');
    });
  });
});
