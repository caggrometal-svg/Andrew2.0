import type { AssistantContext } from '../core/types';
import type { RuntimeCommand, RuntimeResult } from '../core/runtime-contract';
import { isValidRuntimeCommand, runtimeFailure } from '../core/runtime-contract';
import { authorize } from '../permissions/authorize';

export type RuntimeHandler<TInput, TOutput> = (
  input: TInput,
) => TOutput | Promise<TOutput>;

export async function executeCommand<TInput, TOutput>(
  context: AssistantContext,
  command: RuntimeCommand<TInput>,
  handler: RuntimeHandler<TInput, TOutput>,
): Promise<RuntimeResult<TOutput>> {
  const completedAt = (): string => new Date().toISOString();

  if (!isValidRuntimeCommand(command)) {
    return runtimeFailure(
      typeof command?.id === 'string' ? command.id : 'unknown',
      'INVALID_COMMAND',
      'Command contract is invalid.',
      completedAt(),
    );
  }

  const authorization = authorize({
    capability: command.capability,
    autonomy: context.project.autonomy,
    permissions: context.permissions,
  });

  if (!authorization.allowed) {
    return runtimeFailure(command.id, 'PERMISSION_DENIED', authorization.reason, completedAt());
  }

  try {
    const output = await handler(command.input);
    return {
      ok: true,
      commandId: command.id,
      output,
      completedAt: completedAt(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command execution failed.';
    return runtimeFailure(command.id, 'EXECUTION_FAILED', message, completedAt());
  }
}
