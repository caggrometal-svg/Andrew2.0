import { describe, expect, it } from 'vitest';
import { runAgent } from '../server/agent/agent-loop';
import { InMemoryAgentStateStore } from '../server/agent/agent-state-store';
import type { AgentState, AgentPlanner, AgentVerifier } from '../server/agent/agent-types';

const baseState: AgentState = {
  runId: 'run-1', userId: 'user-1', conversationId: 'conversation-1', requestId: 'request-1',
  input: 'calculate 2+2', messages: [{ role: 'user', content: 'calculate 2+2' }],
  phase: 'plan', iteration: 0, maxIterations: 8,
};

const toolPlanner: AgentPlanner = { plan: async () => ({ action: 'tool', toolName: 'calculator', toolInput: { expression: '2+2' }, rationale: 'calculator' }) };
const respondingPlanner: AgentPlanner = { plan: async () => ({ action: 'respond', rationale: 'done' }) };
const passingVerifier: AgentVerifier = { verify: async () => true };

function resetTools(): void {
  // Each test uses an isolated process-level registry only through the route policy.
}

describe('Phase 5 Agent Loop', () => {
  it('completes a direct response', async () => {
    resetTools();
    const result = await runAgent(baseState, { planner: respondingPlanner, verifier: passingVerifier, stateStore: new InMemoryAgentStateStore() });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('done');
    expect(result.state.phase).toBe('complete');
  });

  it('rejects an unknown tool without throwing', async () => {
    resetTools();
    const planner: AgentPlanner = { plan: async () => ({ action: 'tool', toolName: 'unknown-tool', toolInput: {}, rationale: 'unknown' }) };
    const result = await runAgent(baseState, { planner, verifier: passingVerifier, stateStore: new InMemoryAgentStateStore() });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('TOOL_NOT_ALLOWED');
  });

  it('enforces the iteration bound', async () => {
    resetTools();
    const result = await runAgent(baseState, { planner: toolPlanner, verifier: passingVerifier, maxIterations: 2, stateStore: new InMemoryAgentStateStore() });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AGENT_MAX_ITERATIONS');
    expect(result.state.iteration).toBe(2);
  });

  it('fails closed when verification rejects a tool result', async () => {
    resetTools();
    const verifier: AgentVerifier = { verify: async () => false };
    const result = await runAgent(baseState, { planner: toolPlanner, verifier, stateStore: new InMemoryAgentStateStore() });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('AGENT_TOOL_RESULT_VERIFICATION_FAILED');
  });
});
