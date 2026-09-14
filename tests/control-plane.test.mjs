import { describe, expect, it, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({
  getBridgeCommand: vi.fn(),
}));
const controller = vi.hoisted(() => ({
  queueBridgeAction: vi.fn(),
}));
vi.mock('../server/bridge/bridge-store.mjs', () => store);
vi.mock('../server/bridge/bridge-controller.mjs', () => controller);

import { controlPlaneRoute } from '../server/control-plane.mjs';

const TOKEN = 'control-test-secret';
const DEVICE = 'device-test';

function response() {
  return {
    status: 200,
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(payload) { this.body = JSON.parse(payload); },
  };
}

function request(method, path, body) {
  return { method, headers: { authorization: `Bearer ${TOKEN}` }, body };
}

beforeEach(() => {
  process.env.ANDREW_CONTROL_PLANE_TOKEN = TOKEN;
  vi.clearAllMocks();
});

describe('GPT control plane', () => {
  it('rejects missing or invalid bearer credentials', async () => {
    const res = response();
    await controlPlaneRoute({ method: 'GET', headers: {} }, res, new URL('https://andrew.test/api/v1/control/status'), { readJson: vi.fn(), send: (r, status, body) => { r.status = status; r.body = body; } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('control_unauthorized');
  });

  it('reports the control protocol when authenticated', async () => {
    const res = response();
    await controlPlaneRoute(request('GET', '/api/v1/control/status'), res, new URL('https://andrew.test/api/v1/control/status'), { readJson: vi.fn(), send: (r, status, body) => { r.status = status; r.body = body; } });
    expect(res.status).toBe(200);
    expect(res.body.protocol).toBe('gpt-control-v1');
    expect(res.body.commands).toContain('set_runtime_parameter');
  });

  it('queues an authenticated command and exposes the persisted command id', async () => {
    controller.queueBridgeAction.mockResolvedValue({ queued: true, command: { id: '123e4567-e89b-12d3-a456-426614174000', command: 'request_status', createdAt: 1000, expiresAt: 301000 } });
    const res = response();
    const readJson = vi.fn().mockResolvedValue({ targetDeviceId: DEVICE, command: 'request_status' });
    await controlPlaneRoute(request('POST', '/api/v1/control/commands'), res, new URL('https://andrew.test/api/v1/control/commands'), { readJson, send: (r, status, body) => { r.status = status; r.body = body; } });
    expect(res.status).toBe(202);
    expect(res.body.requestId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(controller.queueBridgeAction).toHaveBeenCalledWith({ userId: DEVICE, action: { command: 'request_status', payload: undefined } });
  });

  it('returns the correlated device result', async () => {
    store.getBridgeCommand.mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', command: 'request_status', acknowledgedAt: 2000, ok: true, error: null, result: { status: 'ready' } });
    const res = response();
    await controlPlaneRoute(request('GET', '/api/v1/control/commands/123e4567-e89b-12d3-a456-426614174000?targetDeviceId=device-test'), res, new URL('https://andrew.test/api/v1/control/commands/123e4567-e89b-12d3-a456-426614174000?targetDeviceId=device-test'), { readJson: vi.fn(), send: (r, status, body) => { r.status = status; r.body = body; } });
    expect(res.status).toBe(200);
    expect(res.body.command.ok).toBe(true);
    expect(res.body.command.result.status).toBe('ready');
  });
});
