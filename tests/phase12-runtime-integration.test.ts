import { describe, expect, it } from 'vitest';
import { postgresAgentStateStore } from '../server/runtime/postgres-agent-state-store.mjs';

describe('Phase 12 runtime integration', () => {
  it('exposes the production PostgreSQL state-store contract', () => {
    expect(typeof postgresAgentStateStore.save).toBe('function');
    expect(typeof postgresAgentStateStore.load).toBe('function');
    expect(typeof postgresAgentStateStore.listResumable).toBe('function');
    expect(typeof postgresAgentStateStore.close).toBe('function');
  });

  it('persists, recovers and closes a production runtime state', async () => {
    const runId = `phase12-${Date.now()}`;
    const state = {
      runId,
      userId: 'phase12-user',
      conversationId: 'phase12-session',
      requestId: runId,
      input: 'production recovery',
      messages: [],
      phase: 'executing',
      iteration: 1,
      maxIterations: 8,
    } as const;
    await postgresAgentStateStore.save(state);
    const recovered = await postgresAgentStateStore.load(runId);
    expect(recovered).toMatchObject({ runId, phase: 'executing', iteration: 1 });
    const resumable = await postgresAgentStateStore.listResumable('phase12-user');
    expect(resumable.some((item) => item.runId === runId)).toBe(true);
    await postgresAgentStateStore.close();
  });
});
