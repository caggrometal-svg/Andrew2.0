import type { Capability } from './types';

export interface RuntimeCommand<TInput = unknown> {
  id: string;
  action: string;
  capability: Capability;
  input: TInput;
  requestedAt: string;
  requiresConfirmation?: boolean;
}

export type RuntimeErrorCode =
  | 'INVALID_COMMAND'
  | 'PERMISSION_DENIED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'EXECUTION_FAILED';

export interface RuntimeError {
  code: RuntimeErrorCode;
  message: string;
  retryable: boolean;
}

export type RuntimeResult<TOutput = unknown> =
  | { ok: true; commandId: string; output: TOutput; completedAt: string }
  | { ok: false; commandId: string; error: RuntimeError; completedAt: string };

export function runtimeFailure(
  commandId: string,
  code: RuntimeErrorCode,
  message: string,
  completedAt = new Date().toISOString(),
): RuntimeResult<never> {
  return {
    ok: false,
    commandId,
    completedAt,
    error: {
      code,
      message,
      retryable: code === 'CAPABILITY_UNAVAILABLE' || code === 'EXECUTION_FAILED',
    },
  };
}
