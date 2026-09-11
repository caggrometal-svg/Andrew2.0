import { describe, expect, it } from 'vitest';
import { AndroidBridgeV3InboxClient } from '../src/network/androidBridgeV3Inbox';

describe('Phase 20 Android bridge inbox client', () => {
  it('polls, executes only allow-listed commands, and acknowledges', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const responses = [
      { ok: true, json: async () => ({ ok: true, commands: [{ id: 'cmd-1', command: 'request_status', createdAt: Date.now(), expiresAt: Date.now() + 10000 }] }) },
      { ok: true, json: async () => ({ ok: true, id: 'cmd-1', acknowledgedAt: Date.now() }) },
    ];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, body: init?.body as string | undefined });
      return responses.shift() as Response;
    }) as typeof fetch;
    const client = new AndroidBridgeV3InboxClient({ baseUrl: 'https://example.test', userId: 'user-1', fetchImpl });
    const executed: string[] = [];
    const acks = await client.poll(command => {
      executed.push(command.command);
      return { ok: true };
    });
    expect(executed).toEqual(['request_status']);
    expect(acks).toHaveLength(1);
    expect(calls[1].method).toBe('POST');
    expect(calls[1].body).toContain('cmd-1');
  });

  it('rejects invalid identity and clamps polling interval', () => {
    expect(() => new AndroidBridgeV3InboxClient({ baseUrl: 'https://example.test', userId: 'bad id' })).toThrow('invalid_user_id');
    const client = new AndroidBridgeV3InboxClient({ baseUrl: 'https://example.test', userId: 'user-1', pollIntervalMs: 1 });
    expect(client.isRunning()).toBe(false);
  });

  it('never executes unknown commands returned by the server', async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ ok: true, commands: [{ id: 'bad', command: 'execute_shell', createdAt: Date.now(), expiresAt: Date.now() + 10000 }] }) })) as typeof fetch;
    const client = new AndroidBridgeV3InboxClient({ baseUrl: 'https://example.test', userId: 'user-1', fetchImpl });
    let executed = false;
    const acks = await client.poll(() => { executed = true; return { ok: true }; });
    expect(executed).toBe(false);
    expect(acks).toEqual([]);
  });
});
