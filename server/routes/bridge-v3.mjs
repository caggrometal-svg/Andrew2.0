import { randomUUID } from 'node:crypto';
import { acknowledgeBridgeCommand, enqueueBridgeCommand, initializeBridgeStore, listPendingBridgeCommands } from '../bridge/bridge-store.mjs';
import { getAIProviderHealth } from '../openai.mjs';

const ALLOWED_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const TTL_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_KEYS = 8;
const MAX_STRING_LENGTH = 256;
const ACK_ERRORS = new Set(['expired', 'unsupported', 'invalid_payload']);

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

export async function registerBridgeV3Routes(app) {
  await initializeBridgeStore();

  app.get('/api/v1/bridge/v3/status', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    return { ok: true, userId, commands: [...ALLOWED_COMMANDS], writeEnabled: false, ttlMs: TTL_MS, ai: getAIProviderHealth() };
  });

  app.get('/api/v1/bridge/v3/commands', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    return { ok: true, commands: await listPendingBridgeCommands(userId), writeEnabled: false };
  });

  app.post('/api/v1/bridge/v3/command', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
    const command = typeof body.command === 'string' ? body.command : '';
    if (!ALLOWED_COMMANDS.has(command)) return reply.code(400).send({ ok: false, error: 'unsupported_command' });
    const validation = validatePayload(command, body.payload);
    if (!validation.ok) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    const envelope = createEnvelope(command, validation.value);
    await enqueueBridgeCommand({ userId, envelope });
    return { ok: true, userId, writeEnabled: false, envelope };
  });

  app.post('/api/v1/bridge/v3/ack', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
    if (typeof body.id !== 'string' || body.id.length > 64 || typeof body.ok !== 'boolean') return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    if (body.error !== undefined && (typeof body.error !== 'string' || !ACK_ERRORS.has(body.error))) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    const acknowledged = await acknowledgeBridgeCommand({ userId, id: body.id, ok: body.ok, error: body.error });
    if (!acknowledged) return reply.code(404).send({ ok: false, error: 'command_not_pending' });
    return { ok: true, id: body.id, acknowledgedAt: Date.now() };
  });
}
