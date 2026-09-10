import { describe, expect, it } from 'vitest';
import { StrictPermissionGate } from '../../src/core/tools/permission-gate';
import { ToolRouter } from '../../src/core/tools/tool-router';
import type { PermissionContext, ToolDefinition } from '../../src/core/tools/tool-types';

describe('ToolRouter & PermissionGate Integration', () => {
  type MockArgs = Record<string, never>;
  type MockResult = { status: 'ok' };

  const mockTool: ToolDefinition<MockArgs, MockResult> = {
    name: 'memory.read',
    risk: 'read',
    description: 'Mock memory read tool',
    capabilities: ['memory.read'],
    validate: (args: unknown): args is MockArgs =>
      typeof args === 'object' && args !== null && !Array.isArray(args) && Object.keys(args).length === 0,
    execute: async () => ({ status: 'ok' }),
  };

  const context: PermissionContext = {
    authenticated: true,
    allowedRisks: new Set(['read']),
    capabilities: new Set(['memory.read']),
    userConfirmed: false,
  };

  it('executes an allowed read tool successfully', async () => {
    const router = new ToolRouter(new StrictPermissionGate());
    router.register(mockTool);

    const result = await router.execute<MockResult>({
      requestId: 'req-1',
      tool: 'memory.read',
      args: {},
      risk: 'read',
      source: 'assistant',
      createdAt: new Date().toISOString(),
    }, context);

    expect(result.state).toBe('success');
    expect(result.value).toEqual({ status: 'ok' });
  });

  it('denies unknown tools without direct execution', async () => {
    const router = new ToolRouter(new StrictPermissionGate());

    const result = await router.execute({
      requestId: 'req-2',
      tool: 'unknown.tool',
      args: {},
      risk: 'read',
      source: 'assistant',
      createdAt: new Date().toISOString(),
    }, context);

    expect(result.state).toBe('denied');
    expect(result.error).toBe('unknown_tool');
  });
});
