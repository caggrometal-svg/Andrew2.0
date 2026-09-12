import { afterEach, describe, expect, it } from 'vitest';
import { executeTool } from './tool-executor';
import { clearToolRegistry, registerTool } from './tool-registry';
import { routeTool } from './tool-router';
import { verifyToolResult } from './tool-verifier';
import type { ToolContext, ToolInput } from './tool-types';

const context: ToolContext = { userId: 'u1', conversationId: 'c1', requestId: 'r1' };
const input: ToolInput = { value: 1 };

function tool(name: string, risk: 'read' | 'write' | 'external' = 'read', capability?: string, execute = async () => ({ ok: true, data: 'ok' as const })) {
  return { name, description: name, risk, capability, validate: () => undefined, execute };
}

afterEach(() => clearToolRegistry());

describe('Tool Router unified errors', () => {
  it('rejects invalid input with INVALID_INPUT', async () => {
    registerTool(tool('read'));
    const result = await routeTool('read', [] as unknown as ToolInput, context, { allowed: ['read'] });
    expect(result).toMatchObject({ ok: false, verified: false, errorCode: 'INVALID_INPUT', retryable: false });
  });

  it('rejects an empty name with INVALID_NAME', async () => {
    const result = await routeTool('   ', input, context, { allowed: [] });
    expect(result.errorCode).toBe('INVALID_NAME');
  });

  it('rejects a policy-denied tool with PERMISSION_DENIED', async () => {
    registerTool(tool('read'));
    const result = await routeTool('read', input, context, { allowed: [] });
    expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('rejects an unknown tool with NOT_FOUND', async () => {
    const result = await routeTool('missing', input, context, { allowed: ['missing'] });
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('rejects a missing capability with CAPABILITY_DENIED', async () => {
    registerTool(tool('memory', 'read', 'memory.read'));
    const result = await routeTool('memory', input, context, { allowed: ['memory'], capabilities: [] });
    expect(result.errorCode).toBe('CAPABILITY_DENIED');
  });

  it('rejects write tools unless explicitly enabled', async () => {
    registerTool(tool('write', 'write'));
    const result = await routeTool('write', input, context, { allowed: ['write'] });
    expect(result.errorCode).toBe('WRITE_NOT_ALLOWED');
  });

  it('rejects external tools unless explicitly enabled', async () => {
    registerTool(tool('external', 'external'));
    const result = await routeTool('external', input, context, { allowed: ['external'] });
    expect(result.errorCode).toBe('EXTERNAL_NOT_ALLOWED');
  });

  it('returns a verified success for an allowed tool', async () => {
    registerTool(tool('read'));
    const result = await routeTool('read', input, context, { allowed: ['read'] });
    expect(result).toMatchObject({ ok: true, verified: true, data: 'ok' });
    expect(result.errorCode).toBeUndefined();
  });

  it('normalizes execution exceptions as retryable EXECUTION_FAILED', async () => {
    registerTool(tool('boom', 'read', undefined, async () => { throw new Error('boom'); }));
    const result = await executeTool('boom', input, context);
    expect(result).toMatchObject({ ok: false, errorCode: 'EXECUTION_FAILED', retryable: true, error: 'boom' });
  });

  it('normalizes timeouts as retryable TIMEOUT', async () => {
    registerTool(tool('slow', 'read', undefined, async () => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 50))));
    const result = await executeTool('slow', input, context, 5);
    expect(result).toMatchObject({ ok: false, errorCode: 'TIMEOUT', retryable: true });
  });

  it('verifies failed results using the same error fields', () => {
    const result = verifyToolResult({ ok: false, error: 'denied', errorCode: 'PERMISSION_DENIED', retryable: false });
    expect(result).toMatchObject({ ok: false, error: 'denied', errorCode: 'PERMISSION_DENIED', retryable: false });
  });

  it('rejects structurally invalid results with RESULT_INVALID', () => {
    const result = verifyToolResult({ ok: undefined } as never);
    expect(result).toMatchObject({ ok: false, errorCode: 'RESULT_INVALID', retryable: false });
  });
});
