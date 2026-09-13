import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getBridgeCommand } from '../bridge/bridge-store.mjs';
import { queueBridgeAction } from '../bridge/bridge-controller.mjs';

const MAX_TOKEN_LENGTH = 512;
const MAX_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 60 * 1000;
const DEVICE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);

function configuredToken() {
  return (process.env.ANDREW_CONTROL_PLANE_TOKEN || '').trim();
}

function constantTimeTokenMatch(provided, expected) {
  if (!provided || !expected || provided.length > MAX_TOKEN_LENGTH || expected.length > MAX_TOKEN_LENGTH) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function authenticate(request, reply) {
  const expected = configuredToken();
  const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!constantTimeTokenMatch(provided, expected)) {
    reply.code(expected ? 401 : 503).send({ ok: false, error: expected ? 'control_unauthorized' : 'control_not_configured' });
    return false;
  }
  return true;
}

function bodyObject(request) {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
}

function normalizeTtl(value) {
  if (value === undefined) return DEFAULT_TTL_MS;
  if (!Number.isInteger(value) || value < 5_000 || value > MAX_TTL_MS) return null;
  return value;
}

export async function registerControlPlaneRoutes(app) {
  app.get('/api/v1/control/status', async (request, reply) => {
    if (!authenticate(request, reply)) return;
    return { ok: true, service: 'andrew-control-plane', protocol: 'gpt-control-v1', commands: [...COMMANDS], ttlMaxMs: MAX_TTL_MS };
  });

  app.post('/api/v1/control/commands', async (request, reply) => {
    if (!authenticate(request, reply)) return;
    const body = bodyObject(request);
    const targetDeviceId = typeof body.targetDeviceId === 'string' ? body.targetDeviceId.trim() : '';
    const command = typeof body.command === 'string' ? body.command.trim() : '';
    const requestId = body.requestId === undefined ? `gpt-${randomUUID()}` : String(body.requestId).trim();
    const ttlMs = normalizeTtl(body.ttlMs);
    if (!DEVICE_ID.test(targetDeviceId) || !COMMANDS.has(command) || !REQUEST_ID.test(requestId) || ttlMs === null) return reply.code(400).send({ ok: false, error: 'invalid_control_command' });

    const result = await queueBridgeAction({ userId: targetDeviceId, action: { command, payload: body.payload } });
    if (!result.queued) {
      const status = result.error === 'write_disabled' ? 403 : result.error === 'identity_required' ? 401 : 400;
      return reply.code(status).send({ ok: false, error: result.error, requestId });
    }

    const now = Date.now();
    const envelope = { ...result.command, requestId, source: 'gpt-control-plane', createdAt: now, expiresAt: now + ttlMs };
    return reply.code(202).send({ ok: true, requestId, commandId: result.command.id, targetDeviceId, command, expiresAt: envelope.expiresAt, statusUrl: `/api/v1/control/commands/${result.command.id}` });
  });

  app.get('/api/v1/control/commands/:id', async (request, reply) => {
    if (!authenticate(request, reply)) return;
    const targetDeviceId = typeof request.headers['x-target-device-id'] === 'string' ? request.headers['x-target-device-id'] : '';
    if (!DEVICE_ID.test(targetDeviceId)) return reply.code(400).send({ ok: false, error: 'target_device_required' });
    const command = await getBridgeCommand({ userId: targetDeviceId, id: request.params.id });
    if (!command) return reply.code(404).send({ ok: false, error: 'command_not_found' });
    return { ok: true, command };
  });
}
