import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAndrewMessage } from './andrewBackend';

const store = new Map<string, string>();
const fakeWindow = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
  setTimeout,
  clearTimeout,
  dispatchEvent: () => true,
};

describe('Andrew backend bridge hardening', () => {
  afterEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });

  it('sends persisted identity and recent chat context without exposing unrelated storage', async () => {
    store.set('andrew:user-name', 'Camilo');
    store.set('andrew:ui:chat:v2', JSON.stringify([
      { id: '1', role: 'user', content: 'Recuerda este dato', createdAt: 1 },
      { id: '2', role: 'assistant', content: 'Registrado', createdAt: 2 },
    ]));
    store.set('unrelated:secret', 'must-not-leak');

    Object.assign(globalThis, { window: fakeWindow, document: { querySelector: () => null } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      conversationId: 'andrew-test',
      reply: 'ok',
      responseId: null,
      model: 'test',
      learning: { eligible: false, source: 'test' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await sendAndrewMessage({ message: 'hola', conversationId: 'andrew-test' });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.memory).toContain('Identidad del usuario: Camilo');
    expect(body.memory).toContain('Usuario: Recuerda este dato');
    expect(body.memory).toContain('Andrew: Registrado');
    expect(JSON.stringify(body)).not.toContain('must-not-leak');
    expect((init?.headers as Record<string, string>)['X-Andrew-User-Id']).toMatch(/^user:/);
  });

  it('rejects empty or oversized messages before network access', async () => {
    Object.assign(globalThis, { window: fakeWindow, document: { querySelector: () => null } });
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(sendAndrewMessage({ message: '   ', conversationId: 'test' })).rejects.toThrow('vacío');
    await expect(sendAndrewMessage({ message: 'x'.repeat(12001), conversationId: 'test' })).rejects.toThrow('12.000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
