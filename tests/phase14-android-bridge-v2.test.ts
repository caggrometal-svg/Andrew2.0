import { describe, expect, it, beforeEach } from 'vitest';
import { AndroidBridgeV2 } from '../src/network/androidBridgeV2';

describe('Phase 14 Android Bridge V2', () => {
  beforeEach(() => localStorage.clear());

  it('queues events offline and drains them after reconnect', () => {
    const bridge = new AndroidBridgeV2();
    bridge.setStatus('offline');
    bridge.publish('android.status', { battery: 80 });
    expect(bridge.pending()).toHaveLength(1);
    bridge.setStatus('online');
    expect(bridge.drain()).toHaveLength(1);
    expect(bridge.pending()).toHaveLength(0);
  });

  it('notifies status and event subscribers', () => {
    const bridge = new AndroidBridgeV2();
    const statuses: string[] = [];
    const events: string[] = [];
    bridge.subscribe(status => statuses.push(status));
    bridge.onEvent(event => events.push(event.type));
    bridge.setStatus('syncing');
    bridge.publish('android.connected');
    expect(statuses).toEqual(['syncing']);
    expect(events).toEqual(['android.connected']);
  });

  it('bounds the offline queue', () => {
    const bridge = new AndroidBridgeV2();
    for (let i = 0; i < 120; i += 1) bridge.publish(`event-${i}`);
    expect(bridge.pending()).toHaveLength(100);
    expect(bridge.pending()[0].type).toBe('event-20');
  });
});
