import { afterEach, describe, expect, it } from 'vitest';
import { clearToolRegistry, registerTool } from '../server/tools/tool-registry';
import { executeTool } from '../server/tools/tool-executor';
import { routeTool } from '../server/tools/tool-router';
import { verifyToolResult } from '../server/tools/tool-verifier';
import { registerBuiltinTools } from '../server/tools/builtins';
import type { ToolContext } from '../server/tools/tool-types';

const context: ToolContext = { userId: 'test-user', conversationId: 'test-conversation', requestId: 'test-request' };

afterEach(() => clearToolRegistry());

describe('Phase 4 Tool Router', () => {
  it('TOOL_REGISTRATION', () => {
    registerBuiltinTools();
    expect(['calculator', 'memory', 'media']).toEqual(expect.arrayContaining(['calculator', 'memory', 'media']));
  });

  it('TOOL_UNKNOWN_REJECTED', async () => {
    const result = await executeTool('missing', {}, context);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('NOT_FOUND');
  });

  it('INPUT_VALIDATION', async () => {
    registerBuiltinTools();
    const result = await executeTool('calculator', { expression: 'process.exit()' }, context);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('CALCULATOR_EXPRESSION_NOT_ALLOWED');
    expect(result.errorCode).toBe('INVALID_INPUT');
  });

  it('READ_TOOL', async () => {
    registerBuiltinTools();
    const result = await routeTool('calculator', { expression: '2 + 3 * 4' }, context, { allowed: ['calculator'] });
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.data).toEqual({ value: 14 });
  });

  it('WRITE_TOOL', async () => {
    registerBuiltinTools();
    const memory = new Map<string, unknown>();
    const result = await routeTool('memory', { operation: 'write', key: 'name', value: 'Camilo' }, { ...context, memory: {
      read: async (_userId, key) => memory.get(key) ?? null,
      write: async (_userId, key, value) => { memory.set(key, value); },
    } }, { allowed: ['memory'], allowWrite: true });
    expect(result.ok).toBe(true);
    expect(memory.get('name')).toBe('Camilo');
  });

  it('UNAUTHORIZED_TOOL', async () => {
    registerBuiltinTools();
    const result = await routeTool('memory', { operation: 'write', key: 'x', value: 1 }, context, { allowed: ['memory'] });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('WRITE_NOT_ALLOWED');
  });

  it('EXECUTION_FAILURE_ISOLATED', async () => {
    registerTool({ name: 'failing', description: 'test', risk: 'read', validate: () => undefined, execute: async () => { throw new Error('BOOM'); } });
    const result = await executeTool('failing', {}, context);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('BOOM');
    expect(result.errorCode).toBe('EXECUTION_FAILED');
  });

  it('VERIFICATION_FAILURE', () => {
    expect(verifyToolResult({ ok: false, error: 'bad' })).toEqual({ ok: false, error: 'bad' });
  });

  it('TIMEOUT', async () => {
    registerTool({ name: 'slow', description: 'test', risk: 'read', validate: () => undefined, execute: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)) });
    const result = await executeTool('slow', {}, context, 5);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('TIMEOUT');
    expect(result.retryable).toBe(true);
  });

  it('EXTERNAL_PERMISSION', async () => {
    registerBuiltinTools();
    const result = await routeTool('media', {}, context, { allowed: ['media'] });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('EXTERNAL_NOT_ALLOWED');
  });
});
