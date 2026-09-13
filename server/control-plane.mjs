import { timingSafeEqual } from 'node:crypto';
import { getBridgeCommand } from './bridge/bridge-store.mjs';
import { queueBridgeAction } from './bridge/bridge-controller.mjs';

const MAX_TOKEN_LENGTH = 512;
const TTL_MS = 5 * 60 * 1000;
const DEVICE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);

function configuredToken() {
  return (process.env.ANDREW_CONTROL_PLANE_TOKEN || '').trim();
}

function tokenMatches(provided, expected) {
  if (!provided || !expected || provided.length > MAX_TOKEN_LENGTH || expected.length > MAX_TOKEN_LENGTH) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function authenticate(req) {
  const expected = configuredToken();
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!expected) return { ok: false, status: 503, error: 'control_not_configured' };
  if (!tokenMatches(provided, expected)) return { ok: false, status: 401, error: 'control_unauthorized' };
  return { ok: true };
}

function bodyObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

export async function controlPlaneRoute(req, res, url, { readJson, send }) {
  if (!url.pathname.startsWith('/api/v1/control/')) return false;
  const auth = authenticate(req);
  if (!auth.ok) { send(res, auth.status, { ok: false, error: auth.error }); return true; }

  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/control/status') {
      return send(res, 200, { ok: true, service: 'andrew-control-plane', protocol: 'gpt-control-v1', commands: [...COMMANDS], ttlMs: TTL_MS });
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/control/commands') {
      const body = bodyObject(await readJson(req));
      const targetDeviceId = typeof body.targetDeviceId === 'string' ? body.targetDeviceId.trim() : '';
      const command = typeof body.command === 'string' ? body.command.trim() : '';
      if (!DEVICE_ID.test(targetDeviceId) || !COMMANDS.has(command)) return send(res, 400, { ok: false, error: 'invalid_control_command' });

      const queued = await queueBridgeAction({ userId: targetDeviceId, action: { command, payload: body.payload } });
      if (!queued.queued) {
        const status = queued.error === 'write_disabled' ? 403 : queued.error === 'identity_required' ? 401 : 400;
        return send(res, status, { ok: false, error: queued.error });
      }

      const commandId = queued.command.id;
      return send(res, 202, { ok: true, requestId: commandId, commandId, targetDeviceId, command, expiresAt: queued.command.expiresAt, statusPath: `/api/v1/control/commands/${commandId}` });
    }

    const match = url.pathname.match(/^\/api\/v1\/control\/commands\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && match) {
      const targetDeviceId = url.searchParams.get('targetDeviceId') || '';
      if (!DEVICE_ID.test(targetDeviceId)) return send(res, 400, { ok: false, error: 'target_device_required' });
      const command = await getBridgeCommand({ userId: targetDeviceId, id: match[1] });
      if (!command) return send(res, 404, { ok: false, error: 'command_not_found' });
      return send(res, 200, { ok: true, command });
    }

    return send(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    console.error('[Andrew2] control plane failure', error);
    return send(res, 500, { ok: false, error: 'control_internal_error' });
  }
}
