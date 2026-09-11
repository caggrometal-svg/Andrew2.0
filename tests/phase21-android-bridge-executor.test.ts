import { describe, expect, it, vi } from 'vitest';
import { AndroidBridgeV3Executor } from '../src/network/androidBridgeV3Executor';

describe('Phase 21 controlled Android bridge executor', () => {
  it('executes each allow-listed command through its explicit hook', async () => {
    const hooks = {
      openSettings: vi.fn(),
      setRuntimeParameter: vi.fn(),
      requestStatus: vi.fn(),
      syncNow: vi.fn(),
    };
    const executor = new AndroidBridgeV3Executor(hooks);
    const base = { id: 'cmd', createdAt: Date.now(), expiresAt: Date.now() + 60_000 };

    expect(await executor.execute({ ...base, command: 'open_settings' })).toEqual({ ok: true });
    expect(await executor.execute({ ...base, command: 'set_runtime_parameter', payload: { model: 'gpt-5.6-luna' } })).toEqual({ ok: true });
    expect(await executor.execute({ ...base, command: 'request_status' })).toEqual({ ok: true });
    expect(await executor.execute({ ...base, command: 'sync_now' })).toEqual({ ok: true });
    expect(hooks.openSettings).toHaveBeenCalledTimes(1);
    expect(hooks.setRuntimeParameter).toHaveBeenCalledWith({ model: 'gpt-5.6-luna' });
    expect(hooks.requestStatus).toHaveBeenCalledTimes(1);
    expect(hooks.syncNow).toHaveBeenCalledTimes(1);
  });

  it('rejects expired and malformed payloads before execution', async () => {
    const openSettings = vi.fn();
    const executor = new AndroidBridgeV3Executor({ openSettings });
    const expired = { id: 'x', command: 'open_settings' as const, createdAt: Date.now() - 2000, expiresAt: Date.now() - 1000 };
    expect(await executor.execute(expired)).toEqual({ ok: false, error: 'expired' });
    expect(openSettings).not.toHaveBeenCalled();

    const payload = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i]));
    expect(await executor.execute({ id: 'y', command: 'set_runtime_parameter', payload, createdAt: Date.now(), expiresAt: Date.now() + 60_000 })).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('has no arbitrary command execution surface', () => {
    const executor = new AndroidBridgeV3Executor();
    expect(executor).not.toHaveProperty('executeShell');
    expect(executor).not.toHaveProperty('runCommand');
  });
});
