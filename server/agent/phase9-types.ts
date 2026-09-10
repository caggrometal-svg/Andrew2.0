export type AutonomousPhase = 'planned' | 'executing' | 'verifying' | 'completed' | 'failed';

export interface AgentTaskStep { readonly id: string; readonly toolName: string; readonly toolInput: Readonly<Record<string, unknown>>; readonly critical?: boolean; }
export interface Phase9ExecutionState { readonly runId: string; readonly requestId: string; readonly userId: string; readonly sessionId: string; readonly phase: AutonomousPhase; readonly steps: readonly AgentTaskStep[]; readonly currentStep: number; readonly iteration: number; readonly maxIterations: number; readonly deadlineAt: number; readonly resourceUnits: number; readonly remainingUnits: number; readonly selectedTool?: string; readonly result?: unknown; readonly error?: string; readonly verification?: boolean; }
export interface Phase9StateStore { readonly save: (state: Phase9ExecutionState) => Promise<void>; readonly load: (runId: string) => Promise<Phase9ExecutionState | null>; }
export interface Phase9AuditEvent { readonly runId: string; readonly requestId: string; readonly userId: string; readonly sessionId: string; readonly phase: AutonomousPhase; readonly tool?: string; readonly duration: number; readonly result?: unknown; readonly error?: string; readonly verification?: boolean; readonly timestamp: number; }
export interface Phase9AuditSink { readonly append: (event: Phase9AuditEvent) => Promise<void>; }
