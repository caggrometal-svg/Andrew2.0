import { beforeEach, describe, expect, it } from 'vitest';
import { AndroidBridgeV3 } from '../src/network/androidBridgeV3';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

describe('post-release Android Bridge V3 hardening', () => {
  beforeEach(() => storage.clear());

  it('only creates commands from the explicit capability allowlist', () => {
    const bridge = new AndroidBridgeV3();
    expect(bridge.createCommand('open_settings').command).toBe('open_settings');
    expect(() => bridge.createCommand('execute_shell' as never)).toThrow('unsupported');
  });

  it('persists commands with correlation ids and bounded queue semantics', () => {
    const bridge = new AndroidBridgeV3();
    const command = bridge.enqueue('set_runtime_parameter', { key: 'timeout', value: 30000 });
    expect(command.id).toBeTruthy();
    expect(bridge.pending()).toHaveLength(1);
    expect(bridge.pending()[0].id).toBe(command.id);
  });

  it('acknowledges and removes a command without clearing unrelated commands', () => {
    const bridge = new AndroidBridgeV3();
    const first = bridge.enqueue('request_status');
    const second = bridge.enqueue('sync_now');
    const ack = bridge.acknowledge(first.id, true);

    expect(ack.id).toBe(first.id);
    expect(ack.ok).toBe(true);
    expect(bridge.pending().map(item => item.id)).toEqual([second.id]);
    expect(bridge.acks().at(-1)?.id).toBe(first.id);
  });

  it('keeps the offline command queue bounded', () => {
    const bridge = new AndroidBridgeV3();
    for (let i = 0; i < 120; i += 1) bridge.enqueue('request_status', { sequence: i });
    expect(bridge.pending()).toHaveLength(100);
    expect(bridge.pending()[0].payload?.sequence).toBe(20);
  });
});
