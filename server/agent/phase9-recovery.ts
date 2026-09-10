import type { Phase9ExecutionState, Phase9StateStore } from './phase9-types';

export async function recoverPhase9Run(store: Phase9StateStore, runId: string): Promise<Phase9ExecutionState | null> {
  const state = await store.load(runId);
  if (!state || state.phase === 'completed' || state.phase === 'failed') return state;
  return { ...state, phase: 'planned' };
}
