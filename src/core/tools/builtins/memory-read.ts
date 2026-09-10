import type { MemoryItem } from '../../../memory/memory-types';
import type { MemoryService } from '../../../memory/memory-service';
import type { ToolDefinition, ToolExecutionContext } from '../tool-types';

export interface MemoryReadArgs {
  readonly query?: string;
  readonly limit?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isMemoryReadArgs = (value: unknown): value is MemoryReadArgs => {
  if (!isRecord(value)) return false;
  const query = value.query;
  const limit = value.limit;
  if (query !== undefined && typeof query !== 'string') return false;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return false;
  return true;
};

export const createMemoryReadTool = (memory: MemoryService): ToolDefinition<MemoryReadArgs, MemoryItem[]> => ({
  name: 'memory.read',
  risk: 'read',
  description: 'Read-only retrieval of persistent memory entries.',
  capabilities: ['memory.read'],
  validate: isMemoryReadArgs,
  execute: async (args: MemoryReadArgs, context: ToolExecutionContext): Promise<MemoryItem[]> => {
    if (context.signal.aborted) throw new DOMException('Operation aborted', 'AbortError');
    const query = args.query?.trim() ?? '';
    const limit = args.limit ?? 25;
    const result = query.length === 0 ? [] : memory.recall(query).slice(0, limit);
    if (context.signal.aborted) throw new DOMException('Operation aborted', 'AbortError');
    return result;
  },
});
