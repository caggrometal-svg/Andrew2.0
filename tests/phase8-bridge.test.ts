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

  it('sends through the current gateway chat contract using the persistent session id', async () => {
    const sessionId = getBridgeSessionId();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        ok: true,
        conversationId: sessionId,
        reply: 'respuesta persistente',
        responseId: 'resp-1',
        model: 'test-model',
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendThroughBridge('hola');

    expect(result.reply).toBe('respuesta persistente');
    expect(result.sessionId).toBe(sessionId);
    expect(result.responseId).toBe('resp-1');
    expect(result.model).toBe('test-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/chat');
    expect(fetchMock.mock.calls[0][1].headers['X-Andrew-User-Id']).toMatch(/^device-/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).conversationId).toBe(sessionId);
  });
});
