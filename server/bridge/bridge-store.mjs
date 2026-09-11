import pg from 'pg';

const { Pool } = pg;
const TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 100;

let pool;
let initialized = false;
let initPromise;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for bridge store.');
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.BRIDGE_DB_POOL_MAX || 3),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export async function initializeBridgeStore() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS andrew_bridge_commands (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        command TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        acknowledged_at TIMESTAMPTZ,
        ack_ok BOOLEAN,
        ack_error TEXT
      );
      CREATE INDEX IF NOT EXISTS andrew_bridge_pending_idx
        ON andrew_bridge_commands (user_id, created_at DESC)
        WHERE acknowledged_at IS NULL;
    `);
    initialized = true;
  })();
  try { await initPromise; } finally { initPromise = undefined; }
}

function cleanUserId(userId) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(userId)) throw new TypeError('invalid user id');
  return userId;
}

export async function enqueueBridgeCommand({ userId, envelope }) {
  await initializeBridgeStore();
  const cleanId = cleanUserId(userId);
  const db = getPool();
  await db.query(
    `INSERT INTO andrew_bridge_commands (id, user_id, command, payload, created_at, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0))`,
    [envelope.id, cleanId, envelope.command, envelope.payload === undefined ? null : JSON.stringify(envelope.payload), envelope.createdAt, envelope.expiresAt],
  );
  await db.query(
    `DELETE FROM andrew_bridge_commands WHERE user_id = $1 AND (expires_at <= NOW() OR id IN (
       SELECT id FROM andrew_bridge_commands WHERE user_id = $1 AND acknowledged_at IS NULL ORDER BY created_at DESC OFFSET $2
     ))`,
    [cleanId, MAX_PENDING],
  );
  return envelope;
}

export async function listPendingBridgeCommands(userId) {
  await initializeBridgeStore();
  const cleanId = cleanUserId(userId);
  const result = await getPool().query(
    `DELETE FROM andrew_bridge_commands WHERE user_id = $1 AND expires_at <= NOW() RETURNING id`,
    [cleanId],
  );
  void result;
  const rows = await getPool().query(
    `SELECT id, command, payload, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at,
            EXTRACT(EPOCH FROM expires_at) * 1000 AS expires_at
       FROM andrew_bridge_commands
      WHERE user_id = $1 AND acknowledged_at IS NULL AND expires_at > NOW()
      ORDER BY created_at ASC LIMIT $2`,
    [cleanId, MAX_PENDING],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    command: row.command,
    ...(row.payload === null ? {} : { payload: row.payload }),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  }));
}

export async function acknowledgeBridgeCommand({ userId, id, ok, error }) {
  await initializeBridgeStore();
  const cleanId = cleanUserId(userId);
  const result = await getPool().query(
    `UPDATE andrew_bridge_commands
        SET acknowledged_at = NOW(), ack_ok = $3, ack_error = $4
      WHERE id = $1 AND user_id = $2 AND acknowledged_at IS NULL AND expires_at > NOW()
      RETURNING id`,
    [id, cleanId, ok, error || null],
  );
  return result.rowCount === 1;
}
