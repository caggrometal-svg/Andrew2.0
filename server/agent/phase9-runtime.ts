import type { AgentTaskStep, Phase9AuditSink, Phase9ExecutionState, Phase9StateStore } from './phase9-types';

export interface Phase9ToolExecutor { execute(step: AgentTaskStep): Promise<{ ok: boolean; data?: unknown; error?: string }>; }
export interface Phase9Authorization { authorize(step: AgentTaskStep): Promise<boolean>; }
export interface Phase9RuntimeOptions { maxIterations?: number; timeoutMs?: number; resourceUnits?: number; now?: () => number; }

const transition = (phase: Phase9ExecutionState['phase']): Phase9ExecutionState['phase'] => phase;

export class InMemoryPhase9StateStore implements Phase9StateStore {
  private readonly states = new Map<string, Phase9ExecutionState>();
  async save(state: Phase9ExecutionState): Promise<void> { this.states.set(state.runId, Object.freeze({ ...state, steps: [...state.steps] })); }
  async load(runId: string): Promise<Phase9ExecutionState | null> { return this.states.get(runId) ?? null; }
}

export async function runPhase9(
  initial: Phase9ExecutionState,
  deps: { store: Phase9StateStore; execute: Phase9ToolExecutor; authorize: Phase9Authorization; audit: Phase9AuditSink },
  options: Phase9RuntimeOptions = {},
): Promise<Phase9ExecutionState> {
  const now = options.now ?? Date.now;
  const maxIterations = options.maxIterations ?? initial.maxIterations;
  const deadlineAt = initial.deadlineAt || now() + (options.timeoutMs ?? 30_000);
  let state: Phase9ExecutionState = { ...initial, phase: transition('planned'), maxIterations, deadlineAt, resourceUnits: options.resourceUnits ?? initial.resourceUnits, remainingUnits: options.resourceUnits ?? initial.remainingUnits };
  await deps.store.save(state);
  for (;;) {
    if (state.currentStep >= state.steps.length) {
      state = { ...state, phase: 'verifying', verification: true };
      await deps.store.save(state);
      await deps.audit.append({ runId: state.runId, requestId: state.requestId, userId: state.userId, sessionId: state.sessionId, phase: 'verifying', duration: 0, verification: true, timestamp: now() });
      state = { ...state, phase: 'completed' };
      await deps.store.save(state);
      return state;
    }
    if (state.iteration >= maxIterations || now() >= deadlineAt || state.remainingUnits <= 0) {
      state = { ...state, phase: 'failed', error: 'PHASE9_RESOURCE_LIMIT' };
      await deps.store.save(state);
      return state;
    }
    const step = state.steps[state.currentStep];
    if (!step) { state = { ...state, phase: 'failed', error: 'PHASE9_STEP_MISSING' }; await deps.store.save(state); return state; }
    const started = now();
    state = { ...state, phase: 'executing', iteration: state.iteration + 1, selectedTool: step.toolName };
    await deps.store.save(state);
    if (!(await deps.authorize.authorize(step))) {
      state = { ...state, phase: 'failed', error: `CAPABILITY_DENIED:${step.toolName}` };
      await deps.store.save(state);
      await deps.audit.append({ runId: state.runId, requestId: state.requestId, userId: state.userId, sessionId: state.sessionId, phase: 'failed', tool: step.toolName, duration: now() - started, error: state.error, verification: false, timestamp: now() });
      return state;
    }
    const result = await deps.execute.execute(step);
    state = { ...state, phase: 'verifying', result: result.data, error: result.ok ? undefined : result.error };
    await deps.store.save(state);
    const verified = result.ok && result.data !== undefined;
    await deps.audit.append({ runId: state.runId, requestId: state.requestId, userId: state.userId, sessionId: state.sessionId, phase: 'verifying', tool: step.toolName, duration: now() - started, result: result.data, error: result.error, verification: verified, timestamp: now() });
    if (!verified) { state = { ...state, phase: 'failed', error: result.error ?? 'PHASE9_VERIFICATION_FAILED', verification: false }; await deps.store.save(state); return state; }
    state = { ...state, phase: 'planned', currentStep: state.currentStep + 1, remainingUnits: state.remainingUnits - 1, verification: true };
    await deps.store.save(state);
  }
}

export function createRunState(input: Omit<Phase9ExecutionState, 'phase' | 'currentStep' | 'iteration'>): Phase9ExecutionState {
  return { ...input, phase: 'planned', currentStep: 0, iteration: 0 };
}
