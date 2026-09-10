import pg from 'pg';

const { Pool } = pg;
const MAX_TEXT = 4000;
const RETENTION_DAYS = 7;

let pool;
let initialized = false;
let initPromise;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for controlled learning.');
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.LEARNING_DB_POOL_MAX || 3),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

function cleanText(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (!text || text.length > MAX_TEXT) throw new RangeError(`${field} must contain 1-${MAX_TEXT} characters`);
  return text;
}

export async function initializeLearningStore() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS andrew_learning_observation (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        user_text TEXT NOT NULL,
        assistant_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS andrew_learning_obs_user_created_idx
        ON andrew_learning_observation (user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS andrew_learning_pattern (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        statement TEXT NOT NULL,
        evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
        confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
        status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','accepted','rejected')),
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, pattern_key)
      );
      CREATE INDEX IF NOT EXISTS andrew_learning_pattern_user_status_idx
        ON andrew_learning_pattern (user_id, status, confidence DESC);
    `);
    initialized = true;
  })();
  try { await initPromise; } finally { initPromise = undefined; }
}

export async function recordObservation({ userId, conversationId, userText, assistantText }) {
  await initializeLearningStore();
  const db = getPool();
  const uid = cleanText(userId, 'userId');
  const cid = cleanText(conversationId, 'conversationId');
  const user = cleanText(userText, 'userText');
  const assistant = cleanText(assistantText, 'assistantText');
  const result = await db.query(
    `INSERT INTO andrew_learning_observation (id,user_id,conversation_id,user_text,assistant_text)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,created_at`,
    [crypto.randomUUID(), uid, cid, user, assistant],
  );
  return { id: result.rows[0].id, createdAt: result.rows[0].created_at.toISOString() };
}

export async function countDistinctEvidence(userId, patternKey, since) {
  await initializeLearningStore();
  const result = await getPool().query(
    `SELECT COUNT(DISTINCT conversation_id)::int AS count
       FROM andrew_learning_observation
      WHERE user_id=$1 AND created_at >= $2
        AND user_text ILIKE $3`,
    [userId, since, `%${patternKey}%`],
  );
  return result.rows[0]?.count || 0;
}

export async function upsertPattern({ userId, patternKey, patternType, statement, evidenceCount, confidence }) {
  await initializeLearningStore();
  const result = await getPool().query(
    `INSERT INTO andrew_learning_pattern
      (id,user_id,pattern_key,pattern_type,statement,evidence_count,confidence,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'candidate')
     ON CONFLICT (user_id,pattern_key) DO UPDATE SET
       statement=EXCLUDED.statement,
       evidence_count=EXCLUDED.evidence_count,
       confidence=EXCLUDED.confidence,
       last_seen_at=NOW()
     RETURNING *`,
    [crypto.randomUUID(), userId, patternKey, patternType, statement, evidenceCount, confidence],
  );
  return result.rows[0];
}

export async function listAcceptedPatterns(userId, limit = 20) {
  await initializeLearningStore();
  const result = await getPool().query(
    `SELECT * FROM andrew_learning_pattern
      WHERE user_id=$1 AND status='accepted'
      ORDER BY confidence DESC, last_seen_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 20, 1), 50)],
  );
  return result.rows;
}

export async function pruneLearningObservations() {
  await initializeLearningStore();
  const result = await getPool().query(
    `DELETE FROM andrew_learning_observation WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [RETENTION_DAYS],
  );
  return result.rowCount || 0;
}

export async function closeLearningStore() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  initialized = false;
}
