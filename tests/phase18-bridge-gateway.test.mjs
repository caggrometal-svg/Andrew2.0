import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const pending = new Map();
vi.mock('../server/bridge/bridge-store.mjs', () => ({
  initializeBridgeStore: vi.fn(async () => undefined),
  enqueueBridgeCommand: vi.fn(async ({ userId, envelope }) => { pending.set(`${userId}:${envelope.id}`, { userId, envelope }); return envelope; }),
  listPendingBridgeCommands: vi.fn(async (userId) => [...pending.values()].filter((item) => item.userId === userId).map((item) => item.envelope)),
  acknowledgeBridgeCommand: vi.fn(async ({ userId, id }) => {
    const key = `${userId}:${id}`;
    if (!pending.has(key)) return false;
    pending.delete(key);
    return true;
  }),
}));
vi.mock('../server/openai.mjs', () => ({ getAIProviderHealth: vi.fn(() => ({ providers: {} })) }));

import { registerBridgeV3Routes } from '../server/routes/bridge-v3.mjs';

describe('Phase 18 Android Bridge V3 gateway', () => {
  const build = async () => {
    const app = Fastify();
    await registerBridgeV3Routes(app);
    return app;
  };

  it('fails closed without identity', async () => {
    const app = await build();
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/status' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('identity_required');
    await app.close();
  });

  it('exposes only the four controlled commands', async () => {
    const app = await build();
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/status', headers: { 'x-andrew-user-id': 'camilo-test' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().commands).toEqual(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
    expect(response.json().writeEnabled).toBe(false);
    await app.close();
  });

  it('rejects runtime writes while write access is disabled', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/bridge/v3/command',
      headers: { 'x-andrew-user-id': 'camilo-test' },
      payload: { command: 'set_runtime_parameter', payload: { key: 'timeoutMs', value: 5000 } },
    });
    const body = response.json();
    expect(response.statusCode).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('write_disabled');
    expect(body.envelope).toBeUndefined();
    await app.close();
  });

  it('rejects unsupported commands and malformed payloads', async () => {
    const app = await build();
    const unsupported = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/command', headers: { 'x-andrew-user-id': 'camilo-test' }, payload: { command: 'execute_shell', payload: { command: 'id' } } });
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/command', headers: { 'x-andrew-user-id': 'camilo-test' }, payload: { command: 'request_status', payload: { anything: true } } });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().error).toBe('unsupported_command');
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error).toBe('invalid_payload');
    await app.close();
  });

  it('delivers pending commands and accepts correlated acknowledgements', async () => {
    const app = await build();
    const commandResponse = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/command', headers: { 'x-andrew-user-id': 'camilo-test' }, payload: { command: 'request_status' } });
    expect(commandResponse.statusCode).toBe(200);
    const id = commandResponse.json().envelope.id;
    const pendingResponse = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/commands', headers: { 'x-andrew-user-id': 'camilo-test' } });
    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.json().commands.some((item) => item.id === id)).toBe(true);
    const ackResponse = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/ack', headers: { 'x-andrew-user-id': 'camilo-test' }, payload: { id, ok: true } });
    expect(ackResponse.statusCode).toBe(200);
    const afterAck = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/commands', headers: { 'x-andrew-user-id': 'camilo-test' } });
    expect(afterAck.json().commands.some((item) => item.id === id)).toBe(false);
    await app.close();
  });
});
