import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { securityHeaders } from './hardening.mjs';
import { getRuntimeConfig } from './runtime-config.mjs';
import { acknowledgeBridgeCommand, getBridgeSyncState, initializeBridgeStore, listPendingBridgeCommands } from './bridge/bridge-store.mjs';
import { queueBridgeAction } from './bridge/bridge-controller.mjs';
import { verifyBridgeDeviceAttestation } from './auth/bridge-v3-device.mjs';
import { controlPlaneRoute } from './control-plane.mjs';
import { getAiRouterStatus, routeAiChat } from './ai-router.mjs';

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MODEL = (process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();
const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();
const BRIDGE_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const BRIDGE_TTL_MS = 5 * 60 * 1000;
const ACK_ERRORS = new Set(['expired', 'unsupported', 'invalid_payload', 'healthcheck_failed', 'verification_failed', 'download_failed', 'execution_failed']);
const REVISION_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const responseHeaders = {
  ...securityHeaders,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Andrew-User-Id, X-Device-Id, X-Timestamp, X-Signature, X-Chunk-Start, X-Chunk-End, X-Upload-Size',
  'Access-Control-Max-Age': '600',
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function applyHeaders(res) {
  for (const [name, value] of Object.entries(responseHeaders)) res.setHeader(name, value);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
}

function bridgeAuthFailure(req, requestUrl) {
  return verifyBridgeDeviceAttestation({
    deviceId: req.headers['x-device-id'],
    timestamp: req.headers['x-timestamp'],
    signature: req.headers['x-signature'],
    url: requestUrl,
  });
}

function bridgeWriteEnabled() { return /^(1|true|yes)$/i.test(process.env.BRIDGE_V3_ALLOW_WRITE || process.env.ANDREW_BRIDGE_ALLOW_WRITE || ''); }
function bridgePolicy() { return process.env.ANDREW_ROUTING_POLICY?.trim() || 'balanced'; }

function bridgeArtifactManifest() {
  const raw = process.env.BRIDGE_ARTIFACT_MANIFEST_JSON?.trim();
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid bridge artifact manifest'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid bridge artifact manifest');
  const { revisionId, previousRevisionId, sha256Hex, signatureBase64, downloadUrl } = value;
  if (!REVISION_PATTERN.test(String(revisionId || '')) || (previousRevisionId !== undefined && previousRevisionId !== null && !REVISION_PATTERN.test(String(previousRevisionId))) || !/^[a-f0-9]{64}$/.test(sha256Hex || '') || typeof signatureBase64 !== 'string' || !downloadUrl?.startsWith('https://')) throw new Error('invalid bridge artifact manifest');
  return { revisionId, previousRevisionId: previousRevisionId || null, sha256Hex: sha256Hex.toLowerCase(), signatureBase64, downloadUrl };
}

function cleanBridgeResult(value) {
  if (value === undefined) return undefined;
  const kind = typeof value;
  if (!['string', 'number', 'boolean'].includes(kind) && value !== null && (kind !== 'object' || Array.isArray(value))) throw new TypeError('invalid_result');
  const encoded = JSON.stringify(value);
  if (encoded.length > 8192) throw new TypeError('result_too_large');
  return value;
}

async function chat(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return { status: 400, body: { ok: false, error: 'message_required' } };
  const result = await routeAiChat({ message, memory: body.memory });
  if (!result.ok) {
    return {
      status: 503,
      body: {
        ok: false,
        error: result.error,
        message: result.message,
        providers: getAiRouterStatus(),
        failures: result.failures,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : `conv:${randomUUID()}`,
      reply: result.reply,
      responseId: result.responseId || null,
      model: result.model,
      provider: result.provider,
      attempts: result.attempts,
      learning: { eligible: true, source: 'local-memory-context' },
    },
  };
}

async function bridgeRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/v1/bridge/v3/')) return false;
  const auth = bridgeAuthFailure(req, url.pathname);
  if (!auth.ok) { send(res, 401, { ok: false, error: auth.error }); return true; }
  const deviceId = auth.deviceId;

  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/bridge/v3/status') {
      return send(res, 200, { ok: true, deviceId, commands: [...BRIDGE_COMMANDS], writeEnabled: bridgeWriteEnabled(), ttlMs: BRIDGE_TTL_MS, ai: { policy: bridgePolicy(), router: getAiRouterStatus() } });
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/bridge/v3/commands') {
      return send(res, 200, { ok: true, commands: await listPendingBridgeCommands(deviceId), writeEnabled: bridgeWriteEnabled() });
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/bridge/v3/sync') {
      let artifact = null;
      try { artifact = bridgeArtifactManifest(); } catch { return send(res, 503, { ok: false, error: 'artifact_manifest_unavailable' }); }
      return send(res, 200, { ok: true, deviceId, writeEnabled: bridgeWriteEnabled(), ttlMs: BRIDGE_TTL_MS, ai: { policy: bridgePolicy(), router: getAiRouterStatus() }, artifact, ...(await getBridgeSyncState(deviceId)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/bridge/v3/command') {
      const body = await readJson(req);
      const command = typeof body.command === 'string' ? body.command : '';
      if (!BRIDGE_COMMANDS.has(command)) return send(res, 400, { ok: false, error: 'unsupported_command' });
      const result = await queueBridgeAction({ userId: deviceId, action: { command, payload: body.payload } });
      if (!result.queued) return send(res, result.error === 'write_disabled' ? 403 : result.error === 'identity_required' ? 401 : 400, { ok: false, error: result.error });
      return send(res, 200, { ok: true, deviceId, writeEnabled: bridgeWriteEnabled(), envelope: result.command });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/bridge/v3/ack') {
      const body = await readJson(req);
      const id = typeof body.id === 'string' && body.id.length <= 64 ? body.id : null;
      const revisionId = typeof body.revisionId === 'string' && REVISION_PATTERN.test(body.revisionId) ? body.revisionId : null;
      if ((!id && !revisionId) || typeof body.ok !== 'boolean') return send(res, 400, { ok: false, error: 'invalid_payload' });
      if (body.error !== undefined && (typeof body.error !== 'string' || !ACK_ERRORS.has(body.error))) return send(res, 400, { ok: false, error: 'invalid_payload' });
      let result; try { result = cleanBridgeResult(body.result); } catch (error) { return send(res, 400, { ok: false, error: error.message === 'result_too_large' ? 'result_too_large' : 'invalid_result' }); }
      if (id) {
        const acknowledged = await acknowledgeBridgeCommand({ userId: deviceId, id, ok: body.ok, error: body.error, result });
        if (!acknowledged) return send(res, 404, { ok: false, error: 'command_not_pending' });
      }
      return send(res, 200, { ok: true, ...(id ? { id } : {}), ...(revisionId ? { revisionId } : {}), acknowledgedAt: Date.now(), result: result ?? null });
    }
    return send(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    console.error('[Andrew2] bridge failure', error);
    return send(res, 500, { ok: false, error: 'bridge_internal_error' });
  }
}

async function handler(req, res) {
  applyHeaders(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (await controlPlaneRoute(req, res, url, { readJson, send })) return;
  if (await bridgeRoute(req, res, url)) return;
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, status: 'ready', service: 'andrew2-backend', model: MODEL, ai: getAiRouterStatus(), bridgeV3: true, controlPlane: Boolean(process.env.ANDREW_CONTROL_PLANE_TOKEN) });
  if (req.method === 'GET' && url.pathname === '/api/runtime-config') return send(res, 200, getRuntimeConfig());
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try { const result = await chat(await readJson(req)); return send(res, result.status, result.body); }
    catch (error) { return send(res, Number(error?.statusCode) || 500, { ok: false, error: error?.message || 'internal_error' }); }
  }
  if (url.pathname.startsWith('/api/media/video/')) return send(res, 501, { ok: false, error: 'MEDIA_PIPELINE_NOT_READY', message: 'El canal de chat está operativo; el pipeline multimedia requiere su módulo de almacenamiento.' });
  return send(res, 404, { ok: false, error: 'not_found' });
}

const server = http.createServer((req, res) => {
  handler(req, res).catch(error => {
    if (!res.headersSent) send(res, 500, { ok: false, error: 'internal_error' });
    else res.end();
    console.error('[Andrew2] request failure', error);
  });
});

try {
  await initializeBridgeStore();
} catch (error) {
  console.error('[Andrew2] bridge store initialization failed; refusing to start', error);
  process.exitCode = 1;
  throw error;
}

server.listen(PORT, HOST, () => console.log(`[Andrew2] backend listening on ${HOST}:${PORT}`));
