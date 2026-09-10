import { routeTool } from '../tools/tool-router';
import type { ToolContext } from '../tools/tool-types';
import type {
  AgentPlan,
  AgentRunResult,
  AgentState,
  AgentPlanner,
  AgentStateStore,
  AgentVerifier,
} from './agent-types';

const DEFAULT_MAX_ITERATIONS = 8;

function nextState(state: AgentState, patch: Partial<AgentState>): AgentState {
  return Object.freeze({ ...state, ...patch, messages: [...state.messages] });
}

export interface AgentLoopOptions {
  readonly planner: AgentPlanner;
  readonly verifier: AgentVerifier;
  readonly stateStore: AgentStateStore;
  readonly maxIterations?: number;
  readonly toolTimeoutMs?: number;
}

export async function runAgent(
  initialState: AgentState,
  options: AgentLoopOptions,
): Promise<AgentRunResult> {
  const maxIterations = Number.isInteger(options.maxIterations) && (options.maxIterations ?? 0) > 0
    ? options.maxIterations as number
    : DEFAULT_MAX_ITERATIONS;

  let state = nextState(initialState, { maxIterations, phase: 'plan' });
  await options.stateStore.save(state);

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    state = nextState(state, { iteration, phase: 'plan', error: undefined });
    await options.stateStore.save(state);

    let plan: AgentPlan;
    try {
      plan = await options.planner.plan(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AGENT_PLANNER_FAILED';
      state = nextState(state, { phase: 'failed', error: message });
      await options.stateStore.save(state);
      return { ok: false, state, error: message };
    }

    if (plan.action === 'respond') {
      state = nextState(state, {
        phase: 'verify',
        messages: [...state.messages, { role: 'assistant', content: plan.rationale }],
      });
      const verified = await options.verifier.verify(state, plan.rationale);
      if (!verified) {
        state = nextState(state, { phase: 'failed', error: 'AGENT_RESPONSE_VERIFICATION_FAILED' });
        await options.stateStore.save(state);
        return { ok: false, state, error: state.error };
      }
      state = nextState(state, { phase: 'complete' });
      await options.stateStore.save(state);
      return { ok: true, state, output: plan.rationale };
    }

    if (plan.toolName === undefined || plan.toolInput === undefined) {
      state = nextState(state, { phase: 'failed', error: 'AGENT_INVALID_TOOL_PLAN' });
      await options.stateStore.save(state);
      return { ok: false, state, error: state.error };
    }

    state = nextState(state, {
      phase: 'tool',
      selectedTool: plan.toolName,
      toolInput: plan.toolInput,
    });
    await options.stateStore.save(state);

    const context: ToolContext = {
      userId: state.userId,
      conversationId: state.conversationId,
      requestId: state.requestId,
    };
    const result = await routeTool(
      plan.toolName,
      plan.toolInput,
      context,
      { allowed: [plan.toolName] },
      options.toolTimeoutMs,
    );

    if (!result.ok || !result.verified) {
      state = nextState(state, { phase: 'failed', toolOutput: result, error: result.error ?? 'AGENT_TOOL_FAILED' });
      await options.stateStore.save(state);
      return { ok: false, state, error: state.error };
    }

    state = nextState(state, { phase: 'verify', toolOutput: result.data });
    await options.stateStore.save(state);

    let verified: boolean;
    try {
      verified = await options.verifier.verify(state, result.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AGENT_VERIFIER_FAILED';
      state = nextState(state, { phase: 'failed', error: message });
      await options.stateStore.save(state);
      return { ok: false, state, error: message };
    }

    if (!verified) {
      state = nextState(state, { phase: 'failed', error: 'AGENT_TOOL_RESULT_VERIFICATION_FAILED' });
      await options.stateStore.save(state);
      return { ok: false, state, error: state.error };
    }

    state = nextState(state, {
      phase: 'memory',
      messages: [...state.messages, { role: 'tool', content: JSON.stringify(result.data) }],
    });
    await options.stateStore.save(state);
  }

  state = nextState(state, { phase: 'failed', error: 'AGENT_MAX_ITERATIONS' });
  await options.stateStore.save(state);
  return { ok: false, state, error: state.error };
}
