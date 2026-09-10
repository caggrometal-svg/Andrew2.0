import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBridgeSessionId, getBridgeUserId, sendThroughBridge } from '../src/network/andrewBridge';

describe('Phase 8 persistent app bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('window', {
      localStorage: {
        values: new Map<string, string>(),
        getItem(key: string) { return this.values.get(key) ?? null; },
        setItem(key: string, value: string) { this.values.set(key, value); },
      },
    });
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000') });
  });

  it('creates stable device and session identities', () => {
    expect(getBridgeUserId()).toBe(getBridgeUserId());
    expect(getBridgeSessionId()).toBe(getBridgeSessionId());
    expect(getBridgeUserId()).toMatch(/^device-/);
    expect(getBridgeSessionId()).toMatch(/^session-/);
  });

  it('creates a missing session and sends through the gateway', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'SESSION_NOT_FOUND' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, session: { id: getBridgeSessionId() } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, sessionId: getBridgeSessionId(), message: { content: 'respuesta persistente' }, responseId: 'resp-1', model: 'test-model' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendThroughBridge('hola');
    expect(result.reply).toBe('respuesta persistente');
    expect(result.sessionId).toBe(getBridgeSessionId());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][1].headers['X-Andrew-User-Id']).toMatch(/^device-/);
  });
});
