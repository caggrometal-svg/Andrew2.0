import { describe, expect, it } from 'vitest';
import { runtimeFailure } from '../src/core/runtime-contract';

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
});
