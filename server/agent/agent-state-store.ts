import type { AgentState, AgentStateStore } from './agent-types';

export class InMemoryAgentStateStore implements AgentStateStore {
  private readonly states = new Map<string, AgentState>();

  async save(state: AgentState): Promise<void> {
    this.states.set(state.runId, Object.freeze({ ...state, messages: [...state.messages] }));
  }

  async load(runId: string): Promise<AgentState | null> {
    return this.states.get(runId) ?? null;
  }

  clear(): void {
    this.states.clear();
  }
}
