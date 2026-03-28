/**
 * Test helpers for working with AORP responses
 * Direct AORP testing utilities - no backward compatibility needed
 */

import type { AorpFactoryResult, AorpResponse } from '../../src/aorp/types';
import { parseMarkdown } from './markdown';

/** Minimal task shape parsed from SimpleResponse markdown (rich `###` blocks or compact list lines). */
export interface ExtractedTaskFromMarkdown {
  id?: number;
  title?: string;
  priority?: number;
  done?: boolean;
  due_date?: string;
  project_id?: number;
  labels?: Array<{ id?: number; title: string }>;
  assignees?: Array<{ id?: number; username: string }>;
}

/**
 * Parse task entries from MCP markdown produced by `formatSuccessMessage` / task formatters.
 */
export function extractTasksData(markdown: string): { tasks: ExtractedTaskFromMarkdown[] } {
  const jsonBlock = markdown.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1].trim()) as Record<string, unknown>;
      if (parsed && Array.isArray(parsed.tasks)) {
        return { tasks: parsed.tasks as ExtractedTaskFromMarkdown[] };
      }
      const data = parsed?.data as { tasks?: ExtractedTaskFromMarkdown[] } | undefined;
      if (data?.tasks && Array.isArray(data.tasks)) {
        return { tasks: data.tasks };
      }
    } catch {
      /* ignore */
    }
  }

  const tasksJsonMatch = markdown.match(/\*\*tasks:\*\*\s*(\[[\s\S]*?\])\s*(?:\n\n|\n[^\s[]|$)/);
  if (tasksJsonMatch) {
    try {
      const arr = JSON.parse(tasksJsonMatch[1]) as unknown;
      if (Array.isArray(arr)) {
        return { tasks: arr as ExtractedTaskFromMarkdown[] };
      }
    } catch {
      /* ignore */
    }
  }

  const tasks: ExtractedTaskFromMarkdown[] = [];
  const sections = markdown.split(/(?=### \d+\.\s)/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!/^### \d+\./.test(trimmed)) continue;

    const task: ExtractedTaskFromMarkdown = {};
    const idMatch = trimmed.match(/\(ID:\s*(\d+)\)/);
    if (idMatch) task.id = Number(idMatch[1]);

    const titleMatch = trimmed.match(/### \d+\.\s*\*\*([^*]+)\*\*/);
    if (titleMatch) task.title = titleMatch[1].trim();

    const priMatch = trimmed.match(/\*\*Priority:\*\*.*?\((\d+)\/5\)/);
    if (priMatch) task.priority = Number(priMatch[1]);

    if (trimmed.includes('✅ Done')) task.done = true;
    else if (trimmed.includes('❌ Not Done')) task.done = false;

    const dueMatch = trimmed.match(/-\s\*\*Due:\*\*\s*(.+)/);
    if (dueMatch) task.due_date = dueMatch[1].trim();

    const projMatch = trimmed.match(/-\s\*\*Project:\*\*\s*(\d+)/);
    if (projMatch) task.project_id = Number(projMatch[1]);

    const labelsLine = trimmed.match(/-\s\*\*Labels:\*\*\s*(.+)/);
    if (labelsLine) {
      task.labels = labelsLine[1].split(',').map(s => ({ title: s.trim() }));
    }

    const assigneesLine = trimmed.match(/-\s\*\*Assignees:\*\*\s*(.+)/);
    if (assigneesLine) {
      task.assignees = assigneesLine[1].split(',').map(s => {
        const name = s.replace(/\s*\([^)]*\)\s*$/, '').trim();
        return { username: name };
      });
    }

    tasks.push(task);
  }

  if (tasks.length === 0) {
    const simpleRe = /(\d+)\.\s\*\*([^*]+)\*\*\s*\(ID:\s*(\d+)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = simpleRe.exec(markdown)) !== null) {
      tasks.push({ id: Number(sm[3]), title: sm[2].trim() });
    }
  }

  if (tasks.length === 0 && /\*\*Results:\*\*\s*0\s+item/i.test(markdown)) {
    return { tasks: [] };
  }

  return { tasks };
}

export function extractTaskData(markdown: string): { task?: ExtractedTaskFromMarkdown } {
  const { tasks } = extractTasksData(markdown);
  return { task: tasks[0] };
}

export function getAorpData(markdown: string): Record<string, string> {
  return parseMarkdown(markdown).getOperationMetadata();
}

export function getAorpMetadata(markdown: string): Record<string, string> {
  return parseMarkdown(markdown).getOperationMetadata();
}

/**
 * Extract the AORP response from factory result
 */
export function getAorpResponse(result: AorpFactoryResult | AorpResponse): AorpResponse {
  return 'response' in result ? result.response : result;
}

/**
 * Check if AORP response indicates success
 */
export function isAorpSuccess(result: AorpFactoryResult | AorpResponse): boolean {
  const response = getAorpResponse(result);
  return response.immediate.status === 'success';
}

/**
 * Check if AORP response indicates error
 */
export function isAorpError(result: AorpFactoryResult | AorpResponse): boolean {
  const response = getAorpResponse(result);
  return response.immediate.status === 'error';
}

/**
 * Get the operation from AORP response
 */
export function getAorpOperation(result: AorpFactoryResult | AorpResponse): string {
  const response = getAorpResponse(result);
  return response.details.metadata.operation || 'unknown';
}

/**
 * Get the primary message from AORP response
 */
export function getAorpMessage(result: AorpFactoryResult | AorpResponse): string {
  const response = getAorpResponse(result);
  return response.details.summary;
}

/**
 * Get the key insight from AORP response
 */
export function getAorpKeyInsight(result: AorpFactoryResult | AorpResponse): string {
  const response = getAorpResponse(result);
  return response.immediate.key_insight;
}

/**
 * Get the confidence score from AORP response
 */
export function getAorpConfidence(result: AorpFactoryResult | AorpResponse): number {
  const response = getAorpResponse(result);
  return response.immediate.confidence;
}

/**
 * Get next steps from AORP response
 */
export function getAorpNextSteps(result: AorpFactoryResult | AorpResponse): string[] {
  const response = getAorpResponse(result);
  return response.actionable.next_steps;
}

/**
 * Get quality indicators from AORP response
 */
export function getAorpQuality(result: AorpFactoryResult | AorpResponse) {
  const response = getAorpResponse(result);
  return response.quality;
}

/**
 * Get debug information from AORP response
 */
export function getAorpDebug(result: AorpFactoryResult | AorpResponse): unknown {
  const response = getAorpResponse(result);
  return response.details.debug;
}

/**
 * Expect AORP response to have success status
 */
export function expectAorpSuccess(result: AorpFactoryResult | AorpResponse, expectedOperation?: string): void {
  const response = getAorpResponse(result);

  expect(response.immediate.status).toBe('success');
  expect(response.immediate.confidence).toBeGreaterThan(0);

  if (expectedOperation) {
    expect(response.details.metadata.operation).toBe(expectedOperation);
  }
}

/**
 * Expect AORP response to have error status
 */
export function expectAorpError(result: AorpFactoryResult | AorpResponse, expectedOperation?: string): void {
  const response = getAorpResponse(result);

  expect(response.immediate.status).toBe('error');
  expect(response.immediate.confidence).toBeLessThan(1);

  if (expectedOperation) {
    expect(response.details.metadata.operation).toBe(expectedOperation);
  }
}

/**
 * Get transformation metrics from AORP factory result
 */
export function getAorpMetrics(result: AorpFactoryResult) {
  if (!('transformation' in result)) {
    throw new Error('Result is not an AorpFactoryResult');
  }

  return result.transformation.metrics;
}

/**
 * Get transformation context from AORP factory result
 */
export function getAorpContext(result: AorpFactoryResult) {
  if (!('transformation' in result)) {
    throw new Error('Result is not an AorpFactoryResult');
  }

  return result.transformation.context;
}