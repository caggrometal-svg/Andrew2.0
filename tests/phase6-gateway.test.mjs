import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/andrew2_learning';
process.env.DATABASE_SSL = 'disable';
process.env.OPENAI_API_KEY ||= 'phase6-test-key';
process.env.OPENAI_MODEL ||= 'gpt-5.6-luna';

const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (_url, init) => {
  calls.push(JSON.parse(init.body));
  return new Response(JSON.stringify({
    id: `resp-phase6-${calls.length}`,
    model: 'gpt-5.6-luna',
    output_text: `respuesta-${calls.length}`,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { registerGatewayRoutes } = await import('../server/routes/gateway.mjs');
const sessionStore = await import('../server/session/session-store.mjs');

const app = Fastify();
const userId = `phase6-test-${process.pid}`;
let sessionId;

beforeAll(async () => {
  await sessionStore.initializeSessionStore();
  await registerGatewayRoutes(app);
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
  await sessionStore.closeSessionStore();
});

describe('Phase 6 API Gateway + persistent sessions', () => {
  it('fails closed without a user identity', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/sessions' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('creates an owned session and persists an end-to-end exchange', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/sessions',
      headers: { 'x-andrew-user-id': userId },
      payload: { title: 'Fase 6 E2E' },
    });
    expect(created.statusCode).toBe(201);
    sessionId = created.json().session.id;

    const first = await app.inject({
      method: 'POST', url: `/api/v1/sessions/${sessionId}/messages`,
      headers: { 'x-andrew-user-id': userId },
      payload: { message: 'Mi nombre es Camilo.' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, message: { role: 'assistant', content: 'respuesta-1' } });

    const second = await app.inject({
      method: 'POST', url: `/api/v1/sessions/${sessionId}/messages`,
      headers: { 'x-andrew-user-id': userId },
      payload: { message: '¿Cuál es mi nombre?' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().message.content).toBe('respuesta-2');

    expect(calls).toHaveLength(2);
    expect(calls[1].input).toHaveLength(3);
    expect(calls[1].input[0].role).toBe('user');
    expect(calls[1].input[1].role).toBe('assistant');
    expect(calls[1].input[2].role).toBe('user');

    await sessionStore.closeSessionStore();
    await sessionStore.initializeSessionStore();
    const persisted = await sessionStore.listSessionMessages(userId, sessionId, 20);
    expect(persisted).toHaveLength(4);
    expect(persisted.map((item) => item.content)).toEqual([
      'Mi nombre es Camilo.', 'respuesta-1', '¿Cuál es mi nombre?', 'respuesta-2',
    ]);
  });

  it('enforces session ownership', async () => {
    const response = await app.inject({
      method: 'GET', url: `/api/v1/sessions/${sessionId}`,
      headers: { 'x-andrew-user-id': 'different-user' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('SESSION_NOT_FOUND');
  });
});
