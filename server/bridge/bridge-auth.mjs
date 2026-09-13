import crypto from 'node:crypto';
const WINDOW_MS = 5 * 60 * 1000;
const MAX_NONCES = 10000;
const MAX_NONCE_LENGTH = 128;
const nonces = new Map();
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
function header(headers, name) { const value = headers?.[name] ?? headers?.[name.toLowerCase()]; return typeof value === 'string' ? value.trim() : ''; }
function cleanup(now) { for (const [nonce, expiresAt] of nonces) if (expiresAt <= now) nonces.delete(nonce); while (nonces.size > MAX_NONCES) nonces.delete(nonces.keys().next().value); }
function canonical({ userId, timestamp, nonce, body }) { return `${userId}\n${timestamp}\n${nonce}\n${body}`; }
export function verifyBridgeSignature({ headers, body = '', publicKey }) {
  const userId = header(headers, 'x-andrew-user-id'); const signature = header(headers, 'x-andrew-signature'); const timestampRaw = header(headers, 'x-andrew-timestamp'); const nonce = header(headers, 'x-andrew-nonce'); const timestamp = Number(timestampRaw); const now = Date.now();
  if (!userId || !signature || !timestampRaw || !nonce || !Number.isSafeInteger(timestamp)) return { ok: false, status: 401, error: 'bridge_auth_required' };
  if (!USER_ID.test(userId) || nonce.length > MAX_NONCE_LENGTH) return { ok: false, status: 401, error: 'bridge_auth_invalid' };
  if (Math.abs(now - timestamp) > WINDOW_MS) return { ok: false, status: 401, error: 'bridge_auth_expired' };
  cleanup(now);
  if (nonces.has(`${userId}:${nonce}`)) return { ok: false, status: 401, error: 'bridge_auth_replay' };
  if (!publicKey) return { ok: false, status: 401, error: 'bridge_identity_unregistered' };
  let valid = false;
  try { valid = crypto.verify(null, Buffer.from(canonical({ userId, timestamp, nonce, body })), publicKey, Buffer.from(signature, 'base64url')); } catch { valid = false; }
  if (!valid) return { ok: false, status: 401, error: 'bridge_auth_invalid' };
  nonces.set(`${userId}:${nonce}`, timestamp + WINDOW_MS);
  return { ok: true, userId, timestamp, nonce };
}
export function resetBridgeAuthForTests() { nonces.clear(); }
export { canonical as canonicalBridgeSignature };
