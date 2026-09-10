export type AgentPhase = 'plan' | 'tool' | 'verify' | 'memory' | 'complete' | 'failed';

export interface AgentMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

export interface AgentState {
  readonly runId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly input: string;
  readonly messages: readonly AgentMessage[];
  readonly phase: AgentPhase;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly selectedTool?: string;
  readonly toolInput?: Readonly<Record<string, unknown>>;
  readonly toolOutput?: unknown;
  readonly error?: string;
}

export interface AgentPlan {
  readonly action: 'respond' | 'tool';
  readonly toolName?: string;
  readonly toolInput?: Readonly<Record<string, unknown>>;
  readonly rationale: string;
}

export interface AgentPlanner {
  readonly plan: (state: AgentState) => Promise<AgentPlan>;
}

export interface AgentVerifier {
  readonly verify: (state: AgentState, output: unknown) => Promise<boolean>;
}

export interface AgentStateStore {
  readonly save: (state: AgentState) => Promise<void>;
  readonly load: (runId: string) => Promise<AgentState | null>;
}

export interface AgentRunResult {
  readonly ok: boolean;
  readonly state: AgentState;
  readonly output?: string;
  readonly error?: string;
}
