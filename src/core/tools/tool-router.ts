import type { ExecutionResult, PermissionContext, PermissionGate, ToolDefinition, ToolIntent } from './tool-types';

export class ToolRouter {
  private readonly tools = new Map<string, ToolDefinition<unknown>>();

  constructor(private readonly gate: PermissionGate, private readonly defaultTimeoutMs = 10_000) {}

  register<TArgs, TResult>(tool: ToolDefinition<TArgs, TResult>): void {
    if (this.tools.has(tool.name)) throw new Error(`tool_already_registered:${tool.name}`);
    this.tools.set(tool.name, tool as ToolDefinition<unknown>);
  }

  async execute<TResult>(intent: ToolIntent<unknown>, context: PermissionContext): Promise<ExecutionResult<TResult>> {
    const startedAt = new Date().toISOString();
    const tool = this.tools.get(intent.tool);
    if (!tool) return this.result(intent, 'denied', startedAt, 'unknown_tool');
    if (intent.risk !== tool.risk) return this.result(intent, 'invalid', startedAt, 'risk_mismatch');
    if (!tool.validate(intent.args)) return this.result(intent, 'invalid', startedAt, 'invalid_arguments');

    const decision = this.gate.evaluate(intent, tool, context);
    if (!decision.allowed) return this.result(intent, 'denied', startedAt, decision.reason);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.defaultTimeoutMs);
    try {
      const value = await tool.execute(intent.args, { requestId: intent.requestId, signal: controller.signal });
      return this.result(intent, 'success', startedAt, undefined, value as TResult);
    } catch (error: unknown) {
      const timedOut = controller.signal.aborted;
      return this.result(intent, timedOut ? 'timeout' : 'failed', startedAt, this.errorMessage(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  private result<TResult>(
    intent: ToolIntent<unknown>,
    state: ExecutionResult<TResult>['state'],
    startedAt: string,
    error?: string,
    value?: TResult,
  ): ExecutionResult<TResult> {
    return { requestId: intent.requestId, tool: intent.tool, state, value, error, startedAt, finishedAt: new Date().toISOString() };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'tool_execution_failed';
  }
}
