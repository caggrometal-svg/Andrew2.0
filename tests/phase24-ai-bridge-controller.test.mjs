import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/bridge/bridge-store.mjs', () => ({
  enqueueBridgeCommand: vi.fn(async ({ envelope }) => envelope),
}));

import { planBridgeAction, queueBridgeAction } from '../server/bridge/bridge-controller.mjs';

describe('Phase 24 AI to Android bridge controller', () => {
  it('plans only explicit allow-listed actions', () => {
    expect(planBridgeAction('abre la configuración')).toEqual({ command: 'open_settings' });
    expect(planBridgeAction('sincroniza ahora')).toEqual({ command: 'sync_now' });
    expect(planBridgeAction('dame el estado del runtime')).toEqual({ command: 'request_status' });
    expect(planBridgeAction('cambia el parámetro model a gpt-5.6-luna')).toEqual({
      command: 'set_runtime_parameter',
      payload: { key: 'model', value: 'gpt-5.6-luna' },
    });
    expect(planBridgeAction('ejecuta shell rm -rf /')).toBeNull();
  });

  it('blocks runtime writes unless explicitly enabled', async () => {
    const previous = process.env.ANDREW_BRIDGE_ALLOW_WRITE;
    delete process.env.ANDREW_BRIDGE_ALLOW_WRITE;
    await expect(queueBridgeAction({
      userId: 'user-1',
      action: { command: 'set_runtime_parameter', payload: { key: 'model', value: 'gpt-5.6-luna' } },
    })).resolves.toEqual({ queued: false, error: 'write_disabled' });
    if (previous === undefined) delete process.env.ANDREW_BRIDGE_ALLOW_WRITE;
    else process.env.ANDREW_BRIDGE_ALLOW_WRITE = previous;
  });

  it('queues safe read/sync actions for a valid user', async () => {
    const result = await queueBridgeAction({ userId: 'user-1', action: { command: 'sync_now' } });
    expect(result.queued).toBe(true);
    expect(result.command.command).toBe('sync_now');
    expect(result.command.expiresAt).toBeGreaterThan(result.command.createdAt);
  });
});
