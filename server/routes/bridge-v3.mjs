import { acknowledgeBridgeCommand, initializeBridgeStore, listPendingBridgeCommands } from '../bridge/bridge-store.mjs';
import { getAIProviderHealth } from '../openai.mjs';
import { queueBridgeAction } from '../bridge/bridge-controller.mjs';

const ALLOWED_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const TTL_MS = 5 * 60 * 1000;
const ACK_ERRORS = new Set(['expired', 'unsupported', 'invalid_payload']);

function identity(request) {
  const value = request.headers['x-andrew-user-id'];
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function writeEnabled() {
  return /^(1|true|yes)$/i.test(process.env.ANDREW_BRIDGE_ALLOW_WRITE || '');
}

export async function registerBridgeV3Routes(app) {
  await initializeBridgeStore();

  app.get('/api/v1/bridge/v3/status', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    return { ok: true, userId, commands: [...ALLOWED_COMMANDS], writeEnabled: writeEnabled(), ttlMs: TTL_MS, ai: getAIProviderHealth() };
  });

  app.get('/api/v1/bridge/v3/commands', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    return { ok: true, commands: await listPendingBridgeCommands(userId), writeEnabled: writeEnabled() };
  });

  app.post('/api/v1/bridge/v3/command', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
    const command = typeof body.command === 'string' ? body.command : '';
    if (!ALLOWED_COMMANDS.has(command)) return reply.code(400).send({ ok: false, error: 'unsupported_command' });
    const result = await queueBridgeAction({ userId, action: { command, payload: body.payload } });
    if (!result.queued) {
      const status = result.error === 'identity_required' ? 401 : result.error === 'write_disabled' ? 403 : result.error === 'unsupported_command' ? 400 : 400;
      return reply.code(status).send({ ok: false, error: result.error });
    }
    return { ok: true, userId, writeEnabled: writeEnabled(), envelope: result.command };
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
