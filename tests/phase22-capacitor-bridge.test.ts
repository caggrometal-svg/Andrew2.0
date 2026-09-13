import { describe, expect, it, vi } from 'vitest';
import { createCapacitorBridgeExecutor, createCapacitorBridgePluginFromGlobal } from '../src/network/androidBridgeV3CapacitorAdapter';

describe('Phase 22 controlled Capacitor bridge boundary', () => {
  it('maps only the four explicit native hooks', async () => {
    const plugin = {
      openSettings: vi.fn(),
      setRuntimeParameter: vi.fn(),
      requestStatus: vi.fn(),
      syncNow: vi.fn(),
      unsupportedMethod: vi.fn(),
    };
    const hooks = createCapacitorBridgePluginFromGlobal({ AndrewBridge: plugin });
    const execute = createCapacitorBridgeExecutor(hooks);
    const base = { id: 'cmd', createdAt: Date.now(), expiresAt: Date.now() + 60_000 };

    await execute({ ...base, command: 'open_settings' });
    await execute({ ...base, command: 'set_runtime_parameter', payload: { key: 'model', value: 'gpt-5.6-luna' } });
    await execute({ ...base, command: 'request_status' });
    await execute({ ...base, command: 'sync_now' });

    expect(plugin.openSettings).toHaveBeenCalledTimes(1);
    expect(plugin.setRuntimeParameter).toHaveBeenCalledWith('model', 'gpt-5.6-luna');
    expect(plugin.requestStatus).toHaveBeenCalledTimes(1);
    expect(plugin.syncNow).toHaveBeenCalledTimes(1);
    expect(hooks).not.toHaveProperty('unsupportedMethod');
  });

  it('does not expose arbitrary global methods', () => {
    const hooks = createCapacitorBridgePluginFromGlobal({ AndrewBridge: { unsupportedMethod: vi.fn(), runCommand: vi.fn() } });
    expect(hooks).toEqual({});
  });
});
