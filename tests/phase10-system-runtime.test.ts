import { describe, expect, it } from 'vitest';
import { BridgeRuntime } from '../src/network/bridgeRuntime';

describe('Phase 10 bridge runtime', () => {
  it('tracks status and publishes agent events', () => {
    const runtime = new BridgeRuntime();
    const events: unknown[] = [];
    runtime.subscribe((event) => events.push(event));
    runtime.setStatus('online');
    runtime.publishAgentEvent('run-1', 'executing', { step: 1 });
    expect(runtime.getStatus()).toBe('online');
    expect(events).toHaveLength(2);
  });

  it('persists and drains offline queue', () => {
    const runtime = new BridgeRuntime();
    expect(runtime.enqueue(' hello ')).toBe(true);
    expect(runtime.enqueue('')).toBe(false);
    expect(runtime.getQueueSize()).toBe(1);
    expect(runtime.drain()).toEqual(['hello']);
    expect(runtime.getQueueSize()).toBe(0);
  });
});
