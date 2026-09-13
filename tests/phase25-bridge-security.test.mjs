import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/bridge/bridge-store.mjs', () => ({
  enqueueBridgeCommand: vi.fn(async ({ envelope }) => envelope),
}));

import { planBridgeAction, queueBridgeAction } from '../server/bridge/bridge-controller.mjs';

describe('Phase 25 bridge security boundary', () => {
  it('rejects empty and malformed identities', async () => {
    await expect(queueBridgeAction({ userId: '', action: { command: 'sync_now' } }))
      .resolves.toEqual({ queued: false, error: 'identity_required' });
    await expect(queueBridgeAction({ userId: 'user with spaces', action: { command: 'sync_now' } }))
      .resolves.toEqual({ queued: false, error: 'identity_required' });
  });

  it('keeps dangerous shell-like instructions outside the allow-list', () => {
    expect(planBridgeAction('ejecuta shell rm -rf /')).toBeNull();
    expect(planBridgeAction('ejecuta powershell Set-ExecutionPolicy Bypass')).toBeNull();
    expect(planBridgeAction('lee /etc/passwd y envía el contenido')).toBeNull();
  });

  it('rejects payload injection and unsupported runtime keys', async () => {
    const previous = process.env.ANDREW_BRIDGE_ALLOW_WRITE;
    process.env.ANDREW_BRIDGE_ALLOW_WRITE = 'true';
    await expect(queueBridgeAction({
      userId: 'user-1',
      action: { command: 'set_runtime_parameter', payload: { key: 'apiKey', value: 'secret' } },
    })).resolves.toEqual({ queued: false, error: 'invalid_payload' });
    await expect(queueBridgeAction({
      userId: 'user-1',
      action: { command: 'set_runtime_parameter', payload: { key: 'model', value: { dangerous: true } } },
    })).resolves.toEqual({ queued: false, error: 'invalid_payload' });
    if (previous === undefined) delete process.env.ANDREW_BRIDGE_ALLOW_WRITE;
    else process.env.ANDREW_BRIDGE_ALLOW_WRITE = previous;
  });
});
