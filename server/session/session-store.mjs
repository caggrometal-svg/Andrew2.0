import pg from 'pg';

const { Pool } = pg;
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_MESSAGE = 12000;

let pool;
let initialized = false;
let initPromise;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for persistent sessions.');
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.SESSION_DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

function assertUserId(userId) {
  if (typeof userId !== 'string' || !USER_ID.test(userId)) throw new Error('INVALID_USER_ID');
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw new Error('INVALID_SESSION_ID');
}

function cleanMessage(role, content) {
  if (!['user', 'assistant'].includes(role)) throw new Error('INVALID_MESSAGE_ROLE');
  if (typeof content !== 'string') throw new TypeError('message.content must be a string');
  const value = content.trim();
  if (!value || value.length > MAX_MESSAGE) throw new RangeError(`message.content must contain 1-${MAX_MESSAGE} characters`);
  return { role, content: value };
}

function rowToSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    responseId: row.response_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function initializeSessionStore() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS andrew_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'Nueva conversación',
        response_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS andrew_sessions_user_updated_idx
        ON andrew_sessions (user_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS andrew_session_messages (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES andrew_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS andrew_session_messages_session_created_idx
        ON andrew_session_messages (session_id, created_at ASC, id ASC);
    `);
    initialized = true;
  })();
  try { await initPromise; } finally { initPromise = undefined; }
}

export async function createSession(userId, sessionId = crypto.randomUUID(), title = 'Nueva conversación') {
  assertUserId(userId);
  assertSessionId(sessionId);
  await initializeSessionStore();
  const cleanTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 160) : 'Nueva conversación';
  const result = await getPool().query(
    `INSERT INTO andrew_sessions (id,user_id,title) VALUES ($1,$2,$3) RETURNING *`,
    [sessionId, userId, cleanTitle],
  );
  return rowToSession(result.rows[0]);
}

export async function getSession(userId, sessionId) {
  assertUserId(userId);
  assertSessionId(sessionId);
  await initializeSessionStore();
  const result = await getPool().query('SELECT * FROM andrew_sessions WHERE id=$1 AND user_id=$2', [sessionId, userId]);
  return result.rows[0] ? rowToSession(result.rows[0]) : null;
}

export async function listSessions(userId, limit = 50) {
  assertUserId(userId);
  await initializeSessionStore();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const result = await getPool().query(
    'SELECT * FROM andrew_sessions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2',
    [userId, safeLimit],
  );
  return result.rows.map(rowToSession);
}

export async function appendSessionMessage(userId, sessionId, role, content) {
  const message = cleanMessage(role, content);
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO andrew_session_messages (session_id,role,content) VALUES ($1,$2,$3) RETURNING id,role,content,created_at',
      [sessionId, message.role, message.content],
    );
    await client.query('UPDATE andrew_sessions SET updated_at=NOW() WHERE id=$1', [sessionId]);
    await client.query('COMMIT');
    const row = result.rows[0];
    return { id: String(row.id), role: row.role, content: row.content, createdAt: row.created_at.toISOString() };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listSessionMessages(userId, sessionId, limit = 100) {
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const result = await getPool().query(
    `SELECT id,role,content,created_at FROM (
       SELECT id,role,content,created_at FROM andrew_session_messages
       WHERE session_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2
     ) recent ORDER BY created_at ASC, id ASC`,
    [sessionId, safeLimit],
  );
  return result.rows.map((row) => ({ id: String(row.id), role: row.role, content: row.content, createdAt: row.created_at.toISOString() }));
}

export async function setSessionResponseId(userId, sessionId, responseId) {
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const value = typeof responseId === 'string' && responseId.length <= 200 ? responseId : null;
  const result = await getPool().query(
    'UPDATE andrew_sessions SET response_id=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *',
    [value, sessionId, userId],
  );
  return result.rows[0] ? rowToSession(result.rows[0]) : null;
}

export async function closeSessionStore() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  initialized = false;
}
