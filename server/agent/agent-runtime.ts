import { runAgent } from './agent-loop';
import type { AgentLoopOptions } from './agent-loop';
import type { AgentRunResult, AgentState } from './agent-types';

export function createAgentRuntime(options: AgentLoopOptions) {
  return Object.freeze({
    run: (state: AgentState): Promise<AgentRunResult> => runAgent(state, options),
  });
}
