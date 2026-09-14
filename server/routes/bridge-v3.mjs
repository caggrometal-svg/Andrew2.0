import { acknowledgeBridgeCommand, getBridgeSyncState, initializeBridgeStore, listPendingBridgeCommands } from '../bridge/bridge-store.mjs';
import { queueBridgeAction } from '../bridge/bridge-controller.mjs';
import { applyBridgeRuntimeCommand } from '../ai/provider-router.mjs';
import { bridgeDeviceAttestationHeaders, verifyBridgeDeviceAttestation } from '../auth/bridge-v3-device.mjs';

const ALLOWED_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const TTL_MS = 5 * 60 * 1000;
const ACK_ERRORS = new Set(['expired', 'unsupported', 'invalid_payload', 'healthcheck_failed', 'verification_failed', 'download_failed', 'execution_failed']);
const MAX_RESULT_BYTES = 8192;
const REVISION_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function authenticate(request, reply) {
  const attestation = verifyBridgeDeviceAttestation({ ...bridgeDeviceAttestationHeaders(request), url: request.url });
  if (attestation.ok) return attestation.deviceId;
  reply.code(401).send({ ok: false, error: attestation.error });
  return null;
}
function writeEnabled() { return /^(1|true|yes)$/i.test(process.env.ANDREW_BRIDGE_ALLOW_WRITE || ''); }
function aiPolicy() { return process.env.ANDREW_ROUTING_POLICY?.trim() || 'balanced'; }
function cleanResult(value) {
  if (value === undefined) return undefined;
  const kind = typeof value;
  if (!['string','number','boolean'].includes(kind) && value !== null && (kind !== 'object' || Array.isArray(value))) throw new TypeError('invalid_result');
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_RESULT_BYTES) throw new TypeError('result_too_large');
  return value;
}
function bodyObject(request) { return request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {}; }
function artifactManifest() {
  const raw = process.env.BRIDGE_ARTIFACT_MANIFEST_JSON?.trim();
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid bridge artifact manifest'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid bridge artifact manifest');
  const { revisionId, previousRevisionId, sha256Hex, signatureBase64, downloadUrl } = value;
  if (!REVISION_PATTERN.test(String(revisionId || '')) || (previousRevisionId !== undefined && previousRevisionId !== null && !REVISION_PATTERN.test(String(previousRevisionId))) || !/^[a-f0-9]{64}$/.test(sha256Hex || '') || typeof signatureBase64 !== 'string' || typeof downloadUrl !== 'string') throw new Error('invalid bridge artifact manifest');
  return { revisionId, previousRevisionId: previousRevisionId || null, sha256Hex: sha256Hex.toLowerCase(), signatureBase64, downloadUrl };
}

export async function registerBridgeV3Routes(app) {
  await initializeBridgeStore();

  app.get('/api/v1/bridge/v3/status', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    return { ok: true, deviceId, commands: [...ALLOWED_COMMANDS], writeEnabled: writeEnabled(), ttlMs: TTL_MS, ai: { policy: aiPolicy() } };
  });
  app.get('/api/v1/bridge/v3/commands', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    return { ok: true, commands: await listPendingBridgeCommands(deviceId), writeEnabled: writeEnabled() };
  });
  app.get('/api/v1/bridge/v3/sync', async (request, reply) => {
    const deviceId = authenticate(request, reply); if (!deviceId) return;
    let artifact;
    try { artifact = artifactManifest(); } catch { return reply.code(503).send({ ok: false, error: 'artifact_manifest_unavailable' }); }
    const state = await getBridgeSyncState(deviceId);
    return { ok: true, deviceId, writeEnabled: writeEnabled(), ttlMs: TTL_MS, ai: { policy: aiPolicy() }, artifact, ...state };
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
    if ((!id && !revisionId) || typeof body.ok !== 'boolean') return reply.code(400).send({ ok: false, error: 'invalid_payload' });
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

    if (body.command === 'set_runtime_parameter' && body.ok) {
      try {
        const applied = await applyBridgeRuntimeCommand({ command: body.command, payload: result ?? {} });
        result = cleanResult(applied);
      } catch (error) {
        return reply.code(422).send({ ok: false, id: body.id, error: 'runtime_apply_failed', detail: error instanceof Error ? error.message : String(error) });
      }
    }

    const acknowledged = await acknowledgeBridgeCommand({ userId: deviceId, id: body.id, ok: body.ok, error: body.error, result });
    if (!acknowledged) return reply.code(404).send({ ok: false, error: 'command_not_pending' });
    return { ok: true, id: body.id, acknowledgedAt: Date.now(), result: result ?? null };
  });
}
