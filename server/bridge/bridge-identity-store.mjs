import pg from 'pg';
const { Pool } = pg;
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const memory = new Map();
let pool;
let initialized = false;
let initPromise;
function cleanUserId(userId) {
  if (typeof userId !== 'string' || !USER_ID.test(userId)) throw new TypeError('invalid user id');
  return userId;
}
function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false } });
  return pool;
}
export async function initializeBridgeIdentityStore() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = getPool();
    if (!db) { initialized = true; return; }
    await db.query(`CREATE TABLE IF NOT EXISTS andrew_bridge_identities (user_id TEXT PRIMARY KEY, public_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ); CREATE INDEX IF NOT EXISTS andrew_bridge_identity_active_idx ON andrew_bridge_identities (user_id) WHERE revoked_at IS NULL;`);
    initialized = true;
  })();
  try { await initPromise; } finally { initPromise = undefined; }
}
export async function registerBridgePublicKey({ userId, publicKeyBase64 }) {
  await initializeBridgeIdentityStore();
  const cleanId = cleanUserId(userId);
  if (typeof publicKeyBase64 !== 'string' || publicKeyBase64.length < 32 || publicKeyBase64.length > 4096) throw new TypeError('invalid public key');
  const db = getPool();
  if (!db) { if (memory.has(cleanId)) return false; memory.set(cleanId, publicKeyBase64); return true; }
  const result = await db.query(`INSERT INTO andrew_bridge_identities (user_id, public_key) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET public_key = EXCLUDED.public_key, updated_at = NOW(), revoked_at = NULL WHERE andrew_bridge_identities.revoked_at IS NOT NULL RETURNING user_id`, [cleanId, publicKeyBase64]);
  return result.rowCount === 1;
}
export async function getBridgePublicKey(userId) {
  await initializeBridgeIdentityStore();
  const cleanId = cleanUserId(userId);
  const db = getPool();
  if (!db) return memory.get(cleanId) || null;
  const result = await db.query(`SELECT public_key FROM andrew_bridge_identities WHERE user_id = $1 AND revoked_at IS NULL`, [cleanId]);
  return result.rows[0]?.public_key || null;
}
export function resetBridgeIdentityStoreForTests() { memory.clear(); initialized = false; initPromise = undefined; }
