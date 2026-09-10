export type Phase9Phase = 'planned' | 'executing' | 'verifying' | 'completed' | 'failed';

export interface Phase9Step {
  readonly id: string;
  readonly toolName: string;
  readonly toolInput: Readonly<Record<string, unknown>>;
  readonly critical?: boolean;
}

export interface Phase9State {
  readonly runId: string;
  readonly requestId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly phase: Phase9Phase;
  readonly steps: readonly Phase9Step[];
  readonly currentStep: number;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly deadlineAt: number;
  readonly remainingUnits: number;
  readonly result?: unknown;
  readonly error?: string;
  readonly verification?: boolean;
}
