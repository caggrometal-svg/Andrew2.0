import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';

process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/andrew2_learning';
process.env.DATABASE_SSL = 'disable';
process.env.OPENAI_API_KEY ||= 'phase16-test-key';
process.env.OPENAI_MODEL ||= 'gpt-5.6-luna';

const { registerGatewayRoutes } = await import('../server/routes/gateway.mjs');
const { registerBuiltinTools } = await import('../server/tools/builtins/index.ts');

const app = Fastify();
const userId = 'phase16-test-user';

beforeAll(async () => {
  registerBuiltinTools();
  await registerGatewayRoutes(app);
});

afterAll(async () => {
  await app.close();
});

describe('Phase 16 controlled runtime tool gateway', () => {
  it('fails closed without identity', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/tools' });
    expect(response.statusCode).toBe(401);
  });

  it('exposes only the approved calculator and memory capabilities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tools',
      headers: { 'x-andrew-user-id': userId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      writeEnabled: false,
      tools: [
        { name: 'calculator', risk: 'read' },
        { name: 'memory', risk: 'write' },
      ],
    });
  });

  it('executes a read-only calculator tool through the canonical router', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tools/execute',
      headers: { 'x-andrew-user-id': userId },
      payload: { name: 'calculator', input: { expression: '2*(3+4)' } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, tool: 'calculator', verified: true, data: { value: 14 } });
  });

  it('denies memory writes until the server-side write policy is enabled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tools/execute',
      headers: { 'x-andrew-user-id': userId },
      payload: { name: 'memory', input: { operation: 'write', key: 'test', value: 'blocked' } },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ ok: false, tool: 'memory', verified: false });
  });
});
