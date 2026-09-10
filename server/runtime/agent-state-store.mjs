import pg from 'pg';

const { Pool } = pg;
const RUN_ID = /^[A-Za-z0-9._:-]{1,128}$/;
let pool;
let initialized = false;

function db() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for runtime state.');
  pool = new Pool({ connectionString: url, max: Number(process.env.RUNTIME_DB_POOL_MAX || 5), ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false } });
  return pool;
}

function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new Error('INVALID_RUN_ID');
}

export async function initializeAgentStateStore() {
  if (initialized) return;
  await db().query(`CREATE TABLE IF NOT EXISTS andrew_agent_runs (
    run_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 0,
    max_iterations INTEGER NOT NULL,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS andrew_agent_runs_user_updated_idx ON andrew_agent_runs(user_id, updated_at DESC);`);
  initialized = true;
}

export async function saveAgentState(state) {
  assertRunId(state?.runId);
  await initializeAgentStateStore();
  await db().query(`INSERT INTO andrew_agent_runs(run_id,user_id,session_id,request_id,phase,iteration,max_iterations,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    ON CONFLICT(run_id) DO UPDATE SET phase=EXCLUDED.phase,iteration=EXCLUDED.iteration,max_iterations=EXCLUDED.max_iterations,state=EXCLUDED.state,updated_at=NOW()`,
    [state.runId, state.userId, state.conversationId, state.requestId, state.phase, state.iteration, state.maxIterations, JSON.stringify(state)]);
  return state;
}

export async function loadAgentState(runId) {
  assertRunId(runId);
  await initializeAgentStateStore();
  const result = await db().query('SELECT state FROM andrew_agent_runs WHERE run_id=$1', [runId]);
  return result.rows[0]?.state ?? null;
}

export async function listResumableAgentRuns(userId, limit = 20) {
  await initializeAgentStateStore();
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await db().query(`SELECT state FROM andrew_agent_runs WHERE user_id=$1 AND phase NOT IN ('complete','failed') ORDER BY updated_at DESC LIMIT $2`, [userId, safeLimit]);
  return result.rows.map((row) => row.state);
}

export async function closeAgentStateStore() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  initialized = false;
}
