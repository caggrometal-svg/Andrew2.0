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

const CAPABILITIES = new Set<Capability>([
  'memory.read',
  'memory.write',
  'state.read',
  'state.write',
  'network.read',
  'network.write',
  'analysis.run',
  'project.write',
  'content.generate',
]);

export function isValidRuntimeCommand(command: unknown): command is RuntimeCommand {
  if (!command || typeof command !== 'object') return false;
  const value = command as Record<string, unknown>;
  if (typeof value.id !== 'string' || !value.id.trim()) return false;
  if (typeof value.action !== 'string' || !value.action.trim()) return false;
  if (typeof value.requestedAt !== 'string' || Number.isNaN(Date.parse(value.requestedAt))) return false;
  if (typeof value.requiresConfirmation !== 'undefined' && typeof value.requiresConfirmation !== 'boolean') return false;
  return typeof value.capability === 'string' && CAPABILITIES.has(value.capability as Capability);
}

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
