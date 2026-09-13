import pg from 'pg';

const { Pool } = pg;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_POOL_MAX = 5;

let pool;
let initPromise;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for distributed rate limiting.');
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.RATE_LIMIT_DB_POOL_MAX || DEFAULT_POOL_MAX),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  return pool;
}

async function initializeStore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS andrew_rate_limit (
        bucket_key TEXT PRIMARY KEY,
        window_started_at TIMESTAMPTZ NOT NULL,
        request_count INTEGER NOT NULL CHECK (request_count >= 0)
      )
    `);
  })();
  try {
    await initPromise;
  } finally {
    initPromise = undefined;
  }
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) throw new RangeError('rate limit must be an integer between 1 and 100000');
  return limit;
}

function normalizeWindow(value) {
  const windowMs = Number(value ?? DEFAULT_WINDOW_MS);
  if (!Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 86_400_000) throw new RangeError('rate-limit window must be between 1000 and 86400000 ms');
  return windowMs;
}

function normalizeKey(value) {
  if (typeof value !== 'string') throw new TypeError('rate-limit key must be a string');
  const key = value.trim();
  if (!key || key.length > 512) throw new RangeError('rate-limit key must contain 1-512 characters');
  return key;
}

export async function consumeDistributedRateLimit({ key, limit, windowMs = DEFAULT_WINDOW_MS }) {
  const bucketKey = normalizeKey(key);
  const max = normalizeLimit(limit);
  const window = normalizeWindow(windowMs);
  await initializeStore();

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT window_started_at, request_count FROM andrew_rate_limit WHERE bucket_key=$1 FOR UPDATE',
      [bucketKey],
    );
    const now = Date.now();
    let windowStartedAt;
    let requestCount;

    if (!existing.rows[0]) {
      windowStartedAt = new Date(now);
      requestCount = 1;
      await client.query(
        'INSERT INTO andrew_rate_limit (bucket_key, window_started_at, request_count) VALUES ($1,$2,$3)',
        [bucketKey, windowStartedAt, requestCount],
      );
    } else {
      const current = existing.rows[0];
      const startedAtMs = new Date(current.window_started_at).getTime();
      if (now - startedAtMs >= window) {
        windowStartedAt = new Date(now);
        requestCount = 1;
        await client.query(
          'UPDATE andrew_rate_limit SET window_started_at=$2, request_count=$3 WHERE bucket_key=$1',
          [bucketKey, windowStartedAt, requestCount],
        );
      } else {
        windowStartedAt = new Date(startedAtMs);
        requestCount = Number(current.request_count) + 1;
        await client.query(
          'UPDATE andrew_rate_limit SET request_count=$2 WHERE bucket_key=$1',
          [bucketKey, requestCount],
        );
      }
    }

    await client.query('COMMIT');
    const resetAtMs = windowStartedAt.getTime() + window;
    return {
      allowed: requestCount <= max,
      exceeded: requestCount > max,
      limit: max,
      remaining: Math.max(0, max - requestCount),
      retryAfterMs: Math.max(0, resetAtMs - now),
      resetAt: new Date(resetAtMs).toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDistributedRateLimitStore() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  initPromise = undefined;
}
