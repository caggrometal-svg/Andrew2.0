import { describe, expect, it } from 'vitest';
import { isValidRuntimeCommand, runtimeFailure } from '../src/core/runtime-contract';

describe('runtime contract', () => {
  it('classifies retryable execution failures', () => {
    const result = runtimeFailure('cmd-1', 'EXECUTION_FAILED', 'temporary failure', '2026-09-12T00:00:00.000Z');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.commandId).toBe('cmd-1');
    expect(result.error.retryable).toBe(true);
    expect(result.completedAt).toBe('2026-09-12T00:00:00.000Z');
  });

  it('does not mark invalid commands as retryable', () => {
    const result = runtimeFailure('cmd-2', 'INVALID_COMMAND', 'invalid');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.retryable).toBe(false);
  });

  it('accepts a complete command with a supported capability', () => {
    expect(isValidRuntimeCommand({
      id: 'cmd-3',
      action: 'memory.read',
      capability: 'memory.read',
      input: {},
      requestedAt: '2026-09-12T00:00:00.000Z',
      requiresConfirmation: false,
    })).toBe(true);
  });

  it('rejects malformed or unknown capabilities at runtime', () => {
    const base = {
      id: 'cmd-4',
      action: 'memory.read',
      input: {},
      requestedAt: '2026-09-12T00:00:00.000Z',
    };
    expect(isValidRuntimeCommand({ ...base, capability: 'unknown.capability' })).toBe(false);
    expect(isValidRuntimeCommand({ ...base, capability: 'memory.read', requestedAt: 'not-a-date' })).toBe(false);
    expect(isValidRuntimeCommand(null)).toBe(false);
  });
});
