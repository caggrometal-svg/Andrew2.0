import { assertToolInput, registerTool } from '../tool-registry';
import type { ToolDefinition } from '../tool-types';

type MemoryInput = Readonly<{ operation: 'read' | 'write'; key: string; value?: unknown }>;

const memory: ToolDefinition<MemoryInput> = {
  name: 'memory',
  description: 'Reads or writes memory through the injected Phase 2 memory service.',
  risk: 'write',
  validate: (input) => {
    assertToolInput(input);
    if (input.operation !== 'read' && input.operation !== 'write') throw new Error('MEMORY_INVALID_OPERATION');
    if (typeof input.key !== 'string' || input.key.trim().length === 0) throw new Error('MEMORY_INVALID_KEY');
    if (input.operation === 'write' && !('value' in input)) throw new Error('MEMORY_VALUE_REQUIRED');
  },
  execute: async (input, context) => {
    if (context.memory === undefined) return { ok: false, error: 'MEMORY_SERVICE_UNAVAILABLE' };
    if (input.operation === 'read') return { ok: true, data: { value: await context.memory.read(context.userId, input.key) } };
    await context.memory.write(context.userId, input.key, input.value);
    return { ok: true, data: { written: true } };
  },
};

export function registerMemoryTool(): void { registerTool(memory); }
export { memory };
