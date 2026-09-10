import { describe, expect, it, vi } from 'vitest';
import { StrictPermissionGate, type PermissionContext } from '../../src/core/tools/permission-gate';
import { ToolRouter } from '../../src/core/tools/tool-router';
import type { ToolDefinition, ToolExecutionContext } from '../../src/core/tools/tool-types';

type Args = { readonly value?: string };
type Output = { readonly ok: true };

const validArgs = (value: unknown): value is Args => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.value === undefined || typeof record.value === 'string';
};

const permission = (confirmed = false): PermissionContext => ({
  authenticated: true,
  allowedRisks: ['read'],
  capabilities: ['test.read', 'test.write', 'test.external'],
  userConfirmed: confirmed,
});

const readTool: ToolDefinition<Args, Output> = {
  name: 'test.read',
  risk: 'read',
  description: 'test read tool',
  capabilities: ['test.read'],
  validate: validArgs,
  execute: async (_args: Args, context: ToolExecutionContext): Promise<Output> => {
    if (context.signal.aborted) throw new DOMException('Operation aborted', 'AbortError');
    return { ok: true };
  },
};

const writeTool: ToolDefinition<Args, Output> = {
  name: 'test.write',
  risk: 'write',
  description: 'test write tool',
  capabilities: ['test.write'],
  validate: validArgs,
  execute: async (): Promise<Output> => ({ ok: true }),
};

const externalTool: ToolDefinition<Args, Output> = {
  name: 'test.external',
  risk: 'external',
  description: 'test external tool',
  capabilities: ['test.external'],
  validate: validArgs,
  execute: async (): Promise<Output> => ({ ok: true }),
};

const timeoutTool: ToolDefinition<Args, Output> = {
  name: 'test.timeout',
  risk: 'read',
  description: 'test timeout tool',
  capabilities: ['test.read'],
  validate: validArgs,
  execute: async (_args: Args, context: ToolExecutionContext): Promise<Output> =>
    new Promise<Output>((_resolve, reject) => {
      const onAbort = (): void => reject(new DOMException('Operation aborted', 'AbortError'));
      if (context.signal.aborted) {
        onAbort();
        return;
      }
      context.signal.addEventListener('abort', onAbort, { once: true });
    }),
};

describe('ToolRouter', () => {
  it('registers valid tools and rejects unknown tools', async () => {
    const router = new ToolRouter(
      [readTool],
      new StrictPermissionGate(),
      100,
    );

    const success = await router.execute({
      requestId: 'r1', tool: 'test.read', args: {}, risk: 'read', source: 'test', createdAt: new Date().toISOString(),
    }, permission());
    expect(success.state).toBe('success');

    const unknown = await router.execute({
      requestId: 'r2', tool: 'missing', args: {}, risk: 'read', source: 'test', createdAt: new Date().toISOString(),
    }, permission());
    expect(unknown.state).toBe('denied');
  });

  it('rejects invalid arguments before execution', async () => {
    const execute = vi.fn(async (): Promise<Output> => ({ ok: true }));
    const tool: ToolDefinition<Args, Output> = { ...readTool, execute };
    const router = new ToolRouter([tool], new StrictPermissionGate(), 100);

    const result = await router.execute({
      requestId: 'r3', tool: 'test.read', args: { value: 123 }, risk: 'read', source: 'test', createdAt: new Date().toISOString(),
    }, permission());

    expect(result.state).toBe('invalid');
    expect(execute).not.toHaveBeenCalled();
  });

  it('allows read and denies write/external without confirmation', async () => {
    const router = new ToolRouter(
      [readTool, writeTool, externalTool],
      new StrictPermissionGate(),
      100,
    );

    const read = await router.execute({ requestId: 'r4', tool: 'test.read', args: {}, risk: 'read', source: 'test', createdAt: new Date().toISOString() }, permission());
    const write = await router.execute({ requestId: 'r5', tool: 'test.write', args: {}, risk: 'write', source: 'test', createdAt: new Date().toISOString() }, permission());
    const external = await router.execute({ requestId: 'r6', tool: 'test.external', args: {}, risk: 'external', source: 'test', createdAt: new Date().toISOString() }, permission());

    expect(read.state).toBe('success');
    expect(write.state).toBe('denied');
    expect(external.state).toBe('denied');
  });

  it('requires confirmation even when write/external capabilities exist', async () => {
    const router = new ToolRouter(
      [writeTool, externalTool],
      new StrictPermissionGate(),
      100,
    );

    const write = await router.execute({ requestId: 'r7', tool: 'test.write', args: {}, risk: 'write', source: 'test', createdAt: new Date().toISOString() }, permission(true));
    const external = await router.execute({ requestId: 'r8', tool: 'test.external', args: {}, risk: 'external', source: 'test', createdAt: new Date().toISOString() }, permission(true));

    expect(write.state).toBe('denied');
    expect(external.state).toBe('denied');
  });

  it('isolates execution failures', async () => {
    const failing: ToolDefinition<Args, Output> = {
      ...readTool,
      execute: async (): Promise<Output> => { throw new Error('boom'); },
    };
    const router = new ToolRouter([failing], new StrictPermissionGate(), 100);

    const result = await router.execute({ requestId: 'r9', tool: 'test.read', args: {}, risk: 'read', source: 'test', createdAt: new Date().toISOString() }, permission());

    expect(result.state).toBe('failed');
    expect(result.error).toBe('boom');
  });

  it('aborts and reports timeout without escaping the router', async () => {
    const router = new ToolRouter([timeoutTool], new StrictPermissionGate(), 10);

    const result = await router.execute({ requestId: 'r10', tool: 'test.timeout', args: {}, risk: 'read', source: 'test', createdAt: new Date().toISOString() }, permission());

    expect(result.state).toBe('timeout');
  });
});
