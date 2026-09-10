export type ToolRisk = 'read' | 'write' | 'external';
export type ExecutionState = 'success' | 'denied' | 'failed' | 'timeout' | 'invalid';

export type Capability =
  | 'memory.read'
  | 'memory.write'
  | 'state.read'
  | 'state.write'
  | 'network.read'
  | 'network.write'
  | 'analysis.run'
  | 'project.write'
  | 'content.generate';

export interface ToolIntent<TArgs> {
  readonly requestId: string;
  readonly tool: string;
  readonly args: TArgs;
  readonly risk: ToolRisk;
  readonly source: 'assistant' | 'user' | 'system';
  readonly createdAt: string;
}

export interface PermissionContext {
  readonly authenticated: boolean;
  readonly allowedRisks: ReadonlySet<ToolRisk>;
  readonly capabilities: ReadonlySet<Capability>;
  readonly userConfirmed: boolean;
}

export interface PermissionDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export interface PermissionGate {
  evaluate<TArgs>(intent: ToolIntent<TArgs>, tool: ToolDefinition<TArgs>, context: PermissionContext): PermissionDecision;
}

export interface ToolExecutionContext {
  readonly requestId: string;
  readonly signal: AbortSignal;
}

export interface ExecutionResult<TResult> {
  readonly requestId: string;
  readonly tool: string;
  readonly state: ExecutionState;
  readonly value?: TResult;
  readonly error?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface ToolDefinition<TArgs, TResult = unknown> {
  readonly name: string;
  readonly risk: ToolRisk;
  readonly description: string;
  readonly capabilities: ReadonlyArray<Capability>;
  readonly validate: (args: unknown) => args is TArgs;
  readonly execute: (args: TArgs, context: ToolExecutionContext) => Promise<TResult>;
}
