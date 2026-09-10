import { describe, expect, it } from 'vitest';
import { createAgentRuntime } from './agent-runtime';
import { InMemoryAgentStateStore } from './agent-state-store';
import type { AgentPlanner, AgentState, AgentVerifier } from './agent-types';

const state: AgentState = {
  runId: 'runtime-test', userId: 'u', conversationId: 'c', requestId: 'r', input: 'x',
  messages: [], phase: 'plan', iteration: 0, maxIterations: 1,
};
const planner: AgentPlanner = { plan: async () => ({ action: 'respond', rationale: 'ok' }) };
const verifier: AgentVerifier = { verify: async () => true };

describe('Agent runtime', () => {
  it('delegates execution to the bounded loop', async () => {
    const runtime = createAgentRuntime({ planner, verifier, stateStore: new InMemoryAgentStateStore() });
    const result = await runtime.run(state);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('ok');
  });
});
