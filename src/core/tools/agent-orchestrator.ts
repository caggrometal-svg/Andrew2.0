import type { ExecutionResult, PermissionContext, ToolIntent, ToolRisk } from './tool-types';
import { ToolRouter } from './tool-router';

export interface LlmFunctionCall {
  readonly callId: string;
  readonly name: string;
  readonly arguments: string;
}

export interface ToolFeedbackMessage {
  readonly type: 'function_call_output';
  readonly callId: string;
  readonly output: string;
}

export interface OrchestrationResult<TResult = unknown> {
  readonly intent: ToolIntent<unknown>;
  readonly execution: ExecutionResult<TResult>;
  readonly feedback: ToolFeedbackMessage;
}

export interface ToolRiskResolver {
  resolve(toolName: string): ToolRisk | undefined;
}

export interface AgentOrchestratorOptions {
  readonly maxCallsPerTurn?: number;
  readonly requestIdFactory?: () => string;
}

const fallbackRequestId = (): string => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return cryptoObject.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const parseArguments = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const feedbackOutput = <TResult>(execution: ExecutionResult<TResult>): string => JSON.stringify({
  requestId: execution.requestId,
  tool: execution.tool,
  state: execution.state,
  value: execution.value ?? null,
  error: execution.error ?? null,
  startedAt: execution.startedAt,
  finishedAt: execution.finishedAt,
});

export class AgentOrchestrator {
  private readonly maxCallsPerTurn: number;
  private readonly requestIdFactory: () => string;

  constructor(
    private readonly router: ToolRouter,
    private readonly riskResolver: ToolRiskResolver,
    options: AgentOrchestratorOptions = {},
  ) {
    this.maxCallsPerTurn = options.maxCallsPerTurn ?? 8;
    this.requestIdFactory = options.requestIdFactory ?? fallbackRequestId;
    if (!Number.isInteger(this.maxCallsPerTurn) || this.maxCallsPerTurn < 1 || this.maxCallsPerTurn > 32) {
      throw new Error('invalid_max_calls_per_turn');
    }
  }

  async executeFunctionCall<TResult = unknown>(
    call: LlmFunctionCall,
    context: PermissionContext,
  ): Promise<OrchestrationResult<TResult>> {
    if (call.callId.length === 0 || call.callId.length > 256) throw new Error('invalid_tool_call_id');
    if (call.name.length === 0 || call.name.length > 64) throw new Error('invalid_tool_name');

    const intent: ToolIntent<unknown> = {
      requestId: this.requestIdFactory(),
      tool: call.name,
      args: parseArguments(call.arguments),
      risk: this.riskResolver.resolve(call.name) ?? 'external',
      source: 'assistant',
      createdAt: new Date().toISOString(),
    };

    const execution = await this.router.execute<TResult>(intent, context);
    return {
      intent,
      execution,
      feedback: { type: 'function_call_output', callId: call.callId, output: feedbackOutput(execution) },
    };
  }

  async executeFunctionCalls<TResult = unknown>(
    calls: ReadonlyArray<LlmFunctionCall>,
    context: PermissionContext,
  ): Promise<ReadonlyArray<OrchestrationResult<TResult>>> {
    if (calls.length > this.maxCallsPerTurn) throw new Error('tool_call_limit_exceeded');
    const results: OrchestrationResult<TResult>[] = [];
    for (const call of calls) results.push(await this.executeFunctionCall<TResult>(call, context));
    return results;
  }
}

export const createStaticToolRiskResolver = (
  tools: ReadonlyArray<{ readonly name: string; readonly risk: ToolRisk }>,
): ToolRiskResolver => {
  const risks = new Map<string, ToolRisk>(tools.map((tool) => [tool.name, tool.risk]));
  return { resolve: (toolName: string): ToolRisk | undefined => risks.get(toolName) };
};
