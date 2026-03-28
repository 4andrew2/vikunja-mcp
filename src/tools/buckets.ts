/**
 * Buckets Tool
 * Lists Kanban buckets for a project so agents can discover bucket IDs for moving tasks.
 * Use vikunja_tasks update with bucketId to move a task to a bucket (e.g. Review, Done).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode } from '../types';
import { getClientFromContext } from '../client';
import { setGlobalClientFactory } from '../client';
import { logger } from '../utils/logger';
import { createSuccessResponse } from '../utils/simple-response';
import { formatMcpResponse } from '../utils/simple-response';
import { createAuthRequiredError } from '../utils/error-handler';

interface Bucket {
  id: number;
  title: string;
  position?: number;
}

export function registerBucketsTool(
  server: McpServer,
  authManager: AuthManager,
  clientFactory?: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_buckets',
    'List Kanban buckets for a project. Use bucket IDs with vikunja_tasks update (bucketId) to move tasks between columns (e.g. To Do, Doing, Review, Done).',
    {
      projectId: z.number().int().positive(),
    },
    async (args) => {
      try {
        if (!authManager.isAuthenticated()) {
          throw createAuthRequiredError('list buckets');
        }

        if (clientFactory) {
          await setGlobalClientFactory(clientFactory);
        }

        const client = await getClientFromContext();

        const projectsService = client.projects as unknown as {
          request: (endpoint: string, method: string, body?: unknown) => Promise<unknown>;
        };

        const views = await projectsService.request(
          `/projects/${args.projectId}/views`,
          'GET'
        ) as Array<{ id: number; view_kind?: string; title?: string }>;

        const kanbanView = views.find(
          (v) => v.view_kind === 'kanban' || v.view_kind === 'board'
        );

        if (!kanbanView?.id) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Project ${args.projectId} has no Kanban view`
          );
        }

        const buckets = await projectsService.request(
          `/projects/${args.projectId}/views/${kanbanView.id}/buckets`,
          'GET'
        ) as Bucket[];

        const response = createSuccessResponse(
          'list-buckets',
          `Found ${buckets.length} buckets in project ${args.projectId} (Kanban view)`,
          { buckets: buckets.map((b) => ({ id: b.id, title: b.title, position: b.position })) },
          { projectId: args.projectId, viewId: kanbanView.id, count: buckets.length }
        );

        logger.debug('Buckets tool response', { projectId: args.projectId, count: buckets.length });

        return {
          content: formatMcpResponse(response),
        };
      } catch (error) {
        if (error instanceof MCPError) throw error;
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Failed to list buckets: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
