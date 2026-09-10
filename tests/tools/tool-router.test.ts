import { describe, expect, it, vi } from 'vitest';
import { StrictPermissionGate } from '../../src/core/tools/permission-gate';
import { ToolRouter } from '../../src/core/tools/tool-router';
import type {
  Capability,
  PermissionContext,
  ToolDefinition,
  ToolExecutionContext,
  ToolIntent,
  ToolRisk,
} from '../../src/core/tools/tool-types';

type Args = { readonly value?: string };
type Output = { readonly ok: true };

const validArgs = (value: unknown): value is Args => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.value === undefined || typeof record.value === 'string';
};

const permission = (
  risks: ReadonlyArray<ToolRisk> = ['read'],
  confirmed = false,
): PermissionContext => ({
  authenticated: true,
  allowedRisks: new Set(risks),
  capabilities: new Set<Capability>([
    'memory.read',
    'memory.write',
    'state.read',
    'state.write',
    'network.read',
    'network.write',
  ]),
  userConfirmed: confirmed,
});

const intent = <TArgs>(
  requestId: string,
  tool: string,
  args: TArgs,
  risk: ToolRisk,
): ToolIntent<TArgs> => ({
  requestId,
  tool,
  args,
  risk,
  source: 'system',
  createdAt: new Date().toISOString(),
});

const readTool: ToolDefinition<Args, Output> = {
  name: 'memory.read',
  risk: 'read',
  description: 'test read tool',
  capabilities: ['memory.read'],
  validate: validArgs,
  execute: async (_args: Args, context: ToolExecutionContext): Promise<Output> => {
    if (context.signal.aborted) {
      throw new DOMException('Operation aborted', 'AbortError');
    }
    return { ok: true };
  },
};

const writeTool: ToolDefinition<Args, Output> = {
  name: 'memory.write',
  risk: 'write',
  description: 'test write tool',
  capabilities: ['memory.write'],
  validate: validArgs,
  execute: async (): Promise<Output> => ({ ok: true }),
};

const externalTool: ToolDefinition<Args, Output> = {
  name: 'network.write',
  risk: 'external',
  description: 'test external tool',
  capabilities: ['network.write'],
  validate: validArgs,
  execute: async (): Promise<Output> => ({ ok: true }),
};

const timeoutTool: ToolDefinition<Args, Output> = {
  name: 'state.read',
  risk: 'read',
  description: 'test timeout tool',
  capabilities: ['state.read'],
  validate: validArgs,
  execute: async (_args: Args, context: ToolExecutionContext): Promise<Output> =>
    new Promise<Output>((_resolve, reject) => {
      const onAbort = (): void => {
        reject(new DOMException('Operation aborted', 'AbortError'));
      };
      if (context.signal.aborted) {
        onAbort();
        return;
      }
      context.signal.addEventListener('abort', onAbort, { once: true });
    }),
};

const createRouter = (
  tools: ReadonlyArray<ToolDefinition<Args, Output>>,
  timeoutMs = 100,
): ToolRouter => {
  const router = new ToolRouter(new StrictPermissionGate(), timeoutMs);
  for (const tool of tools) router.register(tool);
  return router;
};

describe('ToolRouter', () => {
  it('registers valid tools and rejects unknown tools', async () => {
    const router = createRouter([readTool]);

    const success = await router.execute<Output>(
      intent('r1', 'memory.read', {}, 'read'),
      permission(),
    );
    expect(success.state).toBe('success');

    const unknown = await router.execute<Output>(
      intent('r2', 'missing', {}, 'read'),
      permission(),
    );
    expect(unknown.state).toBe('denied');
    expect(unknown.error).toBe('unknown_tool');
  });

  it('rejects invalid arguments before execution', async () => {
    const execute = vi.fn(async (): Promise<Output> => ({ ok: true }));
    const tool: ToolDefinition<Args, Output> = { ...readTool, execute };
    const router = createRouter([tool]);

    const result = await router.execute<Output>(
      intent('r3', 'memory.read', { value: 123 }, 'read'),
      permission(),
    );

    expect(result.state).toBe('invalid');
    expect(result.error).toBe('invalid_arguments');
    expect(execute).not.toHaveBeenCalled();
  });

  it('allows read and denies write/external without confirmation', async () => {
    const router = createRouter([readTool, writeTool, externalTool]);

    const read = await router.execute<Output>(
      intent('r4', 'memory.read', {}, 'read'), permission(),
    );
    const write = await router.execute<Output>(
      intent('r5', 'memory.write', {}, 'write'), permission(),
    );
    const external = await router.execute<Output>(
      intent('r6', 'network.write', {}, 'external'), permission(),
    );

    expect(read.state).toBe('success');
    expect(write.state).toBe('denied');
    expect(external.state).toBe('denied');
  });

  it('denies risk mismatch before execution', async () => {
    const execute = vi.fn(async (): Promise<Output> => ({ ok: true }));
    const tool: ToolDefinition<Args, Output> = { ...readTool, execute };
    const router = createRouter([tool]);

    const result = await router.execute<Output>(
      intent('r7', 'memory.read', {}, 'write'),
      permission(['write'], true),
    );

    expect(result.state).toBe('invalid');
    expect(result.error).toBe('risk_mismatch');
    expect(execute).not.toHaveBeenCalled();
  });

  it('isolates execution failures', async () => {
    const failing: ToolDefinition<Args, Output> = {
      ...readTool,
      execute: async (): Promise<Output> => {
        throw new Error('boom');
      },
    };
    const router = createRouter([failing]);

    const result = await router.execute<Output>(
      intent('r8', 'memory.read', {}, 'read'),
      permission(),
    );

    expect(result.state).toBe('failed');
    expect(result.error).toBe('boom');
  });

  it('aborts and reports timeout without escaping the router', async () => {
    const router = createRouter([timeoutTool], 10);

    const result = await router.execute<Output>(
      intent('r9', 'state.read', {}, 'read'),
      permission(),
    );

    expect(result.state).toBe('timeout');
    expect(result.error).toBe('Operation aborted');
  });
});
