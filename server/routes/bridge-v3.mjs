import { androidBridgeV3 } from '../../src/network/androidBridgeV3';

const ALLOWED_COMMANDS = new Set([
  'open_settings',
  'set_runtime_parameter',
  'request_status',
  'sync_now',
]);

function identity(request) {
  return String(request.headers['x-andrew-user-id'] || '').trim();
}

export function registerBridgeV3Routes(app) {
  app.get('/api/v1/bridge/v3/status', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });
    return { ok: true, userId, commands: [...ALLOWED_COMMANDS], writeEnabled: false };
  });

  app.post('/api/v1/bridge/v3/command', async (request, reply) => {
    const userId = identity(request);
    if (!userId) return reply.code(401).send({ ok: false, error: 'identity_required' });

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const command = typeof body.command === 'string' ? body.command : '';
    if (!ALLOWED_COMMANDS.has(command)) {
      return reply.code(400).send({ ok: false, error: 'unsupported_command' });
    }

    const envelope = androidBridgeV3.createCommand(command, body.payload);
    return { ok: true, userId, envelope };
  });
}
