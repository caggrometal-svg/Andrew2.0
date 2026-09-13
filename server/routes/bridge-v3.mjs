import { acknowledgeBridgeCommand, getBridgeSyncState, initializeBridgeStore, listPendingBridgeCommands } from '../bridge/bridge-store.mjs';
import { getAIProviderHealth } from '../openai.mjs';
import { queueBridgeAction } from '../bridge/bridge-controller.mjs';
import { bridgeDeviceAttestationHeaders, verifyBridgeDeviceAttestation } from '../auth/bridge-v3-device.mjs';

const ALLOWED_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const TTL_MS = 5 * 60 * 1000;
const ACK_ERRORS = new Set(['expired', 'unsupported', 'invalid_payload', 'healthcheck_failed', 'verification_failed', 'download_failed']);
const MAX_RESULT_BYTES = 8192;
const REVISION_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function authenticate(request, reply) {
  const attestation = verifyBridgeDeviceAttestation({ ...bridgeDeviceAttestationHeaders(request), url: request.url });
  if (attestation.ok) return attestation.deviceId;
  reply.code(401).send({ ok: false, error: attestation.error });
  return null;
}
function writeEnabled() { return /^(1|true|yes)$/i.test(process.env.ANDREW_BRIDGE_ALLOW_WRITE || ''); }
function cleanResult(value) {
  if (value === undefined) return undefined;
  const kind = typeof value;
  if (!['string','number','boolean'].includes(kind) && value !== null && (kind !== 'object' || Array.isArray(value))) throw new TypeError('invalid_result');
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_RESULT_BYTES) throw new TypeError('result_too_large');
  return value;
}
function bodyObject(request) { return request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {}; }

export async function registerBridgeV3Routes(app) {
  await initializeBridgeStore();

  app.get('/api/v1/bridge/v3/status', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    return { ok: true, deviceId, commands: [...ALLOWED_COMMANDS], writeEnabled: writeEnabled(), ttlMs: TTL_MS, ai: getAIProviderHealth() };
  });
  app.get('/api/v1/bridge/v3/commands', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    return { ok: true, commands: await listPendingBridgeCommands(deviceId), writeEnabled: writeEnabled() };
  });
  app.get('/api/v1/bridge/v3/sync', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    const state = await getBridgeSyncState(deviceId);
    return { ok: true, deviceId, writeEnabled: writeEnabled(), ttlMs: TTL_MS, ai: getAIProviderHealth(), ...state };
  });
  app.post('/api/v1/bridge/v3/command', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    const body = bodyObject(request);
    const command = typeof body.command === 'string' ? body.command : '';
    if (!ALLOWED_COMMANDS.has(command)) return reply.code(400).send({ ok: false, error: 'unsupported_command' });
    const result = await queueBridgeAction({ userId: deviceId, action: { command, payload: body.payload } });
    if (!result.queued) { const status = result.error === 'write_disabled' ? 403 : result.error === 'identity_required' ? 401 : 400; return reply.code(status).send({ ok: false, error: result.error }); }
    return { ok: true, deviceId, writeEnabled: writeEnabled(), envelope: result.command };
  });
  app.post('/api/v1/bridge/v3/ack', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    const body = bodyObject(request);
    const id = typeof body.id === 'string' && body.id.length <= 64 ? body.id : null;
    const revisionId = typeof body.revisionId === 'string' && REVISION_PATTERN.test(body.revisionId) ? body.revisionId : null;
    if (!id && !revisionId || typeof body.ok !== 'boolean') return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    if (body.error !== undefined && (typeof body.error !== 'string' || !ACK_ERRORS.has(body.error))) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    let result;
    try { result = cleanResult(body.result); } catch (error) { return reply.code(400).send({ ok: false, error: error instanceof TypeError && error.message === 'result_too_large' ? 'result_too_large' : 'invalid_result' }); }
    if (id) {
      const acknowledged = await acknowledgeBridgeCommand({ userId: deviceId, id, ok: body.ok, error: body.error, result });
      if (!acknowledged) return reply.code(404).send({ ok: false, error: 'command_not_pending' });
    }
    return { ok: true, ...(id ? { id } : {}), ...(revisionId ? { revisionId } : {}), acknowledgedAt: Date.now(), result: result ?? null };
  });
  app.post('/api/v1/bridge/v3/result', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    const body = bodyObject(request);
    if (typeof body.id !== 'string' || body.id.length > 64 || typeof body.ok !== 'boolean' || typeof body.command !== 'string' || !ALLOWED_COMMANDS.has(body.command)) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    if (body.error !== undefined && (typeof body.error !== 'string' || !ACK_ERRORS.has(body.error))) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    let result; try { result = cleanResult(body.result); } catch (error) { return reply.code(400).send({ ok: false, error: error instanceof TypeError && error.message === 'result_too_large' ? 'result_too_large' : 'invalid_result' }); }
    const acknowledged = await acknowledgeBridgeCommand({ userId: deviceId, id: body.id, ok: body.ok, error: body.error, result });
    if (!acknowledged) return reply.code(404).send({ ok: false, error: 'command_not_pending' });
    return { ok: true, id: body.id, acknowledgedAt: Date.now(), result: result ?? null };
  });
}
