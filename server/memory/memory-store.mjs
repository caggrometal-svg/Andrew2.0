import pg from 'pg';

const { Pool } = pg;

const MAX_TEXT = 4000;
const MAX_TAGS = 20;

let pool;
let initialized = false;
let initPromise;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for persistent memory.');
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.MEMORY_DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export async function initializeMemoryStore() {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS andrew_memory (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        kind TEXT NOT NULL DEFAULT 'fact',
        text TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        importance SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
        source TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS andrew_memory_user_updated_idx
        ON andrew_memory (user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS andrew_memory_user_kind_idx
        ON andrew_memory (user_id, kind);
    `);
    initialized = true;
  })();
  try { await initPromise; } finally { initPromise = undefined; }
}

function cleanText(text) {
  if (typeof text !== 'string') throw new TypeError('memory.text must be a string');
  const value = text.trim();
  if (!value || value.length > MAX_TEXT) throw new RangeError(`memory.text must contain 1-${MAX_TEXT} characters`);
  return value;
}

function cleanTags(tags = []) {
  if (!Array.isArray(tags)) throw new TypeError('memory.tags must be an array');
  return tags.filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim().slice(0, 80))
    .filter(Boolean).slice(0, MAX_TAGS);
}

function rowToMemory(row) {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    kind: row.kind,
    text: row.text,
    tags: row.tags || [],
    importance: row.importance,
    source: row.source,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listMemories(userId, limit = 50) {
  await initializeMemoryStore();
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM andrew_memory WHERE user_id=$1 ORDER BY importance DESC, updated_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 50, 1), 100)],
  );
  return result.rows.map(rowToMemory);
}

export async function searchMemories(userId, query, limit = 8) {
  await initializeMemoryStore();
  const db = getPool();
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return listMemories(userId, limit);
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  const clauses = terms.map((_, i) => `(text ILIKE $${i + 2} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE $${i + 2}))`);
  const values = [userId, ...terms.map((term) => `%${term}%`), Math.min(Math.max(Number(limit) || 8, 1), 20)];
  const result = await db.query(
    `SELECT * FROM andrew_memory WHERE user_id=$1 AND (${clauses.join(' OR ')}) ORDER BY importance DESC, updated_at DESC LIMIT $${values.length}`,
    values,
  );
  return result.rows.map(rowToMemory);
}

export async function createMemory(input) {
  await initializeMemoryStore();
  const db = getPool();
  const id = crypto.randomUUID();
  const text = cleanText(input.text);
  const tags = cleanTags(input.tags);
  const kind = typeof input.kind === 'string' ? input.kind.slice(0, 40) : 'fact';
  const source = typeof input.source === 'string' ? input.source.slice(0, 80) : 'user';
  const importance = Math.min(Math.max(Number(input.importance) || 3, 1), 5);
  const conversationId = typeof input.conversationId === 'string' ? input.conversationId.slice(0, 128) : null;
  const result = await db.query(
    `INSERT INTO andrew_memory (id,user_id,conversation_id,kind,text,tags,importance,source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, input.userId, conversationId, kind, text, tags, importance, source],
  );
  return rowToMemory(result.rows[0]);
}

export async function updateMemory(userId, id, patch) {
  await initializeMemoryStore();
  const db = getPool();
  const sets = [];
  const values = [userId, id];
  if (patch.text !== undefined) { sets.push(`text=$${values.length + 1}`); values.push(cleanText(patch.text)); }
  if (patch.tags !== undefined) { sets.push(`tags=$${values.length + 1}`); values.push(cleanTags(patch.tags)); }
  if (patch.importance !== undefined) { sets.push(`importance=$${values.length + 1}`); values.push(Math.min(Math.max(Number(patch.importance) || 3, 1), 5)); }
  if (patch.kind !== undefined) { sets.push(`kind=$${values.length + 1}`); values.push(String(patch.kind).slice(0, 40)); }
  if (!sets.length) return getMemory(userId, id);
  sets.push('updated_at=NOW()');
  const result = await db.query(`UPDATE andrew_memory SET ${sets.join(', ')} WHERE user_id=$1 AND id=$2 RETURNING *`, values);
  return result.rows[0] ? rowToMemory(result.rows[0]) : null;
}

export async function getMemory(userId, id) {
  await initializeMemoryStore();
  const result = await getPool().query('SELECT * FROM andrew_memory WHERE user_id=$1 AND id=$2', [userId, id]);
  return result.rows[0] ? rowToMemory(result.rows[0]) : null;
}

export async function deleteMemory(userId, id) {
  await initializeMemoryStore();
  const result = await getPool().query('DELETE FROM andrew_memory WHERE user_id=$1 AND id=$2 RETURNING id', [userId, id]);
  return result.rowCount === 1;
}

export async function clearMemories(userId) {
  await initializeMemoryStore();
  const result = await getPool().query('DELETE FROM andrew_memory WHERE user_id=$1', [userId]);
  return result.rowCount;
}

export async function closeMemoryStore() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  initialized = false;
}
