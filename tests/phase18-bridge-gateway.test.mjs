import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
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

  it('creates a bounded, expiring command envelope', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/bridge/v3/command',
      headers: { 'x-andrew-user-id': 'camilo-test' },
      payload: { command: 'set_runtime_parameter', payload: { key: 'timeoutMs', value: 5000 } },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.writeEnabled).toBe(false);
    expect(body.envelope.command).toBe('set_runtime_parameter');
    expect(body.envelope.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.envelope.expiresAt - body.envelope.createdAt).toBe(300000);
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
});
