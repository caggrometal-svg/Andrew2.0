import { randomUUID } from 'node:crypto';

const ALLOWED_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const TTL_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_KEYS = 8;
const MAX_STRING_LENGTH = 256;

function identity(request) {
  const value = request.headers['x-andrew-user-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function validatePayload(command, payload) {
  if (payload === undefined) return { ok: true, value: undefined };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false };
  const entries = Object.entries(payload);
  if (entries.length > MAX_PAYLOAD_KEYS) return { ok: false };
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) return { ok: false };
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) return { ok: false };
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return { ok: false };
  }
  if (command === 'open_settings' && Object.keys(payload).some((key) => key !== 'section')) return { ok: false };
  if (command === 'request_status' && Object.keys(payload).length > 0) return { ok: false };
  if (command === 'sync_now' && Object.keys(payload).length > 0) return { ok: false };
  if (command === 'set_runtime_parameter' && (!('key' in payload) || typeof payload.key !== 'string' || payload.key.length > 64 || !('value' in payload))) return { ok: false };
  return { ok: true, value: payload };
}

function createEnvelope(command, payload) {
  const createdAt = Date.now();
  return { id: randomUUID(), command, payload, createdAt, expiresAt: createdAt + TTL_MS };
}

export function registerBridgeV3Routes(app) {
  app.get('/api/v1/bridge/v3/status', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    return { ok: true, userId, commands: [...ALLOWED_COMMANDS], writeEnabled: false, ttlMs: TTL_MS };
  });

  app.post('/api/v1/bridge/v3/command', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
    const command = typeof body.command === 'string' ? body.command : '';
    if (!ALLOWED_COMMANDS.has(command)) return reply.code(400).send({ ok: false, error: 'unsupported_command' });
    const validation = validatePayload(command, body.payload);
    if (!validation.ok) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    return { ok: true, userId, writeEnabled: false, envelope: createEnvelope(command, validation.value) };
  });
}
