import { randomUUID } from 'node:crypto';
import { enqueueBridgeCommand } from './bridge-store.mjs';

const TTL_MS = 5 * 60 * 1000;
const COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const ALLOWED_PARAMETERS = new Set(['model', 'timeoutMs', 'pollIntervalMs', 'syncEnabled']);
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function validUserId(userId) {
  return typeof userId === 'string' && USER_ID.test(userId);
}

function validPayload(command, payload) {
  if (payload === undefined) return true;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const entries = Object.entries(payload);
  if (entries.length > 8) return false;
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) return false;
    if (typeof value === 'string' && value.length > 256) return false;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return false;
  }
  if (command === 'open_settings') return Object.keys(payload).every((key) => key === 'section');
  if (command === 'request_status' || command === 'sync_now') return entries.length === 0;
  if (command === 'set_runtime_parameter') {
    return typeof payload.key === 'string' && ALLOWED_PARAMETERS.has(payload.key)
      && Object.prototype.hasOwnProperty.call(payload, 'value')
      && (typeof payload.value === 'string' || typeof payload.value === 'number' || typeof payload.value === 'boolean');
  }
  return false;
}

function envelope(command, payload) {
  const createdAt = Date.now();
  return { id: randomUUID(), command, ...(payload === undefined ? {} : { payload }), createdAt, expiresAt: createdAt + TTL_MS };
}

function parseRuntimeValue(value) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.slice(0, 256);
}

export function planBridgeAction(message) {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (!text) return null;

  if (/\b(?:abre|abrir|open)\b.*\b(?:ajustes|configuraci[oó]n|settings)\b/i.test(text)) {
    return { command: 'open_settings' };
  }
  if (/\b(?:sincroniza|sincronizar|sync)\b/i.test(text)) {
    return { command: 'sync_now' };
  }
  if (/\b(?:dame|mostrar|mu[eé]strame|consultar|consulta|ver)\b.*\bestado\b/i.test(text)) {
    return { command: 'request_status' };
  }

  const match = text.match(/\b(?:cambia|cambiar|establece|establecer|configura|configurar)\b.*?\b(model|timeoutMs|pollIntervalMs|syncEnabled)\b\s*(?:a|=|:)\s*([^,;\n]+)/i);
  if (!match) return null;
  return { command: 'set_runtime_parameter', payload: { key: match[1], value: parseRuntimeValue(match[2]) } };
}

export async function queueBridgeAction({ userId, action }) {
  if (!validUserId(userId)) return { queued: false, error: 'identity_required' };
  if (!action || !COMMANDS.has(action.command)) return { queued: false, error: 'unsupported_command' };
  if (action.command === 'set_runtime_parameter' && !/^(1|true|yes)$/i.test(process.env.ANDREW_BRIDGE_ALLOW_WRITE || '')) {
    return { queued: false, error: 'write_disabled' };
  }
  if (!validPayload(action.command, action.payload)) return { queued: false, error: 'invalid_payload' };

  const command = envelope(action.command, action.payload);
  await enqueueBridgeCommand({ userId, envelope: command });
  return { queued: true, command };
}
