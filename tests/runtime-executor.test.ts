import { describe, expect, it } from 'vitest';
import { executeCommand } from '../src/assistant/runtime-executor';
import type { AssistantContext } from '../src/core/types';

const context: AssistantContext = {
  project: {
    projectId: 'runtime-test',
    status: 'active',
    autonomy: 'assisted',
    updatedAt: '2026-09-12T00:00:00.000Z',
    metadata: {},
  },
  permissions: [{
    capability: 'state.read',
    decision: 'allow',
    grantedAt: '2026-09-12T00:00:00.000Z',
  }],
  recentActivity: [],
};

describe('runtime executor', () => {
  it('executes an explicitly authorized command', async () => {
    const result = await executeCommand(
      context,
      {
        id: 'cmd-allowed',
        action: 'state.read',
        capability: 'state.read',
        input: { key: 'status' },
        requestedAt: '2026-09-12T00:00:00.000Z',
      },
      (input) => ({ ok: true, input }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commandId).toBe('cmd-allowed');
    expect(result.output).toEqual({ ok: true, input: { key: 'status' } });
  });

  it('does not invoke the handler when permission is absent', async () => {
    let invoked = false;
    const result = await executeCommand(
      context,
      {
        id: 'cmd-denied',
        action: 'network.read',
        capability: 'network.read',
        input: null,
        requestedAt: '2026-09-12T00:00:00.000Z',
      },
      () => {
        invoked = true;
        return 'should-not-run';
      },
    );

    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PERMISSION_DENIED');
  });

  it('normalizes handler failures into the runtime contract', async () => {
    const result = await executeCommand(
      context,
      {
        id: 'cmd-failure',
        action: 'state.read',
        capability: 'state.read',
        input: null,
        requestedAt: '2026-09-12T00:00:00.000Z',
      },
      () => {
        throw new Error('backend unavailable');
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EXECUTION_FAILED');
    expect(result.error.message).toBe('backend unavailable');
    expect(result.error.retryable).toBe(true);
  });
});
