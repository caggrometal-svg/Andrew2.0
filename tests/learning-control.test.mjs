import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { extractCandidates } from '../server/learning/learning-engine.mjs';
import {
  initializeLearningStore,
  recordObservation,
  listAcceptedPatterns,
  closeLearningStore,
} from '../server/learning/learning-store.mjs';
import { processLearningObservation } from '../server/learning/learning-engine.mjs';

const dbAvailable = Boolean(process.env.DATABASE_URL?.trim());

describe('controlled learning extractor', () => {
  it('extracts explicit preference without treating arbitrary text as learning', () => {
    expect(extractCandidates('Prefiero respuestas breves y precisas.')).toEqual([
      { patternType: 'preference', patternKey: 'respuestas breves y precisas', statement: 'respuestas breves y precisas' },
    ]);
    expect(extractCandidates('El cielo está despejado.')).toEqual([]);
  });

  it('extracts identity and working-style candidates', () => {
    expect(extractCandidates('Me llamo Camilo.')).toHaveLength(1);
    expect(extractCandidates('Quiero que priorices las pruebas.')).toHaveLength(1);
  });
});

describe.skipIf(!dbAvailable)('controlled learning persistence gate', () => {
  const userId = `learning-test-${process.pid}`;
  const conversationA = `conv-a-${process.pid}`;
  const conversationB = `conv-b-${process.pid}`;

  beforeEach(async () => {
    await initializeLearningStore();
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false } });
    await pool.query('DELETE FROM andrew_learning_observation WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM andrew_learning_pattern WHERE user_id=$1', [userId]);
    await pool.end();
  });

  it('requires two distinct conversations before accepting a pattern', async () => {
    await recordObservation({ userId, conversationId: conversationA, userText: 'Prefiero respuestas breves.', assistantText: 'Entendido.' });
    let result = await processLearningObservation({ userId, userText: 'Prefiero respuestas breves.' });
    expect(result[0].status).toBe('candidate');

    await recordObservation({ userId, conversationId: conversationB, userText: 'Prefiero respuestas breves.', assistantText: 'Entendido.' });
    result = await processLearningObservation({ userId, userText: 'Prefiero respuestas breves.' });
    expect(result[0].status).toBe('accepted');

    const accepted = await listAcceptedPatterns(userId);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].statement).toBe('respuestas breves');
  });

  afterAll(async () => {
    await closeLearningStore();
  });
});
