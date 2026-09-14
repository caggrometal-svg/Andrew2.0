import { randomUUID } from 'node:crypto';
import { enqueueBridgeCommand } from './bridge-store.mjs';

const TTL_MS = 5 * 60 * 1000;
const COMMANDS = new Set([
  'sync_web_artifact',
  'rollback_web_artifact',
  'health_check',
  'provider_health_check',
  'open_settings',
  'request_status',
  'sync_now',
]);
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function validUserId(userId) { return typeof userId === 'string' && USER_ID.test(userId); }
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
  return entries.length === 0;
}
function envelope(command, payload) { const createdAt = Date.now(); return { id: randomUUID(), command, ...(payload === undefined ? {} : { payload }), createdAt, expiresAt: createdAt + TTL_MS }; }

export function planBridgeAction(message) {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (!text) return null;
  if (/\b(?:abre|abrir|open)\b.*\b(?:ajustes|configuraci[oó]n|settings)\b/i.test(text)) return { command: 'open_settings' };
  if (/\b(?:sincroniza|sincronizar|sync)\b/i.test(text)) return { command: 'sync_now' };
  if (/\b(?:dame|mostrar|mu[eé]strame|consultar|consulta|ver)\b.*\bestado\b/i.test(text)) return { command: 'request_status' };
  if (/\b(?:revertir|revert|rollback)\b/i.test(text)) return { command: 'rollback_web_artifact' };
  if (/\b(?:salud|health)\b.*\b(?:proveedores|providers|ia)\b/i.test(text)) return { command: 'provider_health_check' };
  if (/\b(?:salud|health)\b/i.test(text)) return { command: 'health_check' };
  if (/\b(?:actualiza|actualizar|hot.?update|artefacto)\b/i.test(text)) return { command: 'sync_web_artifact' };
  return null;
}

export async function queueBridgeAction({ userId, action }) {
  if (!validUserId(userId)) return { queued: false, error: 'identity_required' };
  if (!action || !COMMANDS.has(action.command)) return { queued: false, error: 'unsupported_command' };
  if (!validPayload(action.command, action.payload)) return { queued: false, error: 'invalid_payload' };
  const command = envelope(action.command, action.payload);
  await enqueueBridgeCommand({ userId, envelope: command });
  return { queued: true, command };
}
