import { getTool } from './tool-registry';
import type { ToolContext, ToolInput, ToolResult, ToolRisk } from './tool-types';

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'TOOL_EXECUTION_FAILED';
}

function failure(name: string, risk: ToolRisk, durationMs: number, error: string): ToolResult {
  return {
    ok: false,
    error,
    metadata: { toolName: name, risk, durationMs },
  };
}

export async function executeTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ToolResult> {
  const startedAt = Date.now();
  let tool;

  try {
    tool = getTool(name);
  } catch (error: unknown) {
    return failure(name, 'read', Date.now() - startedAt, normalizeError(error));
  }

  try {
    tool.validate(input);
  } catch (error: unknown) {
    return failure(tool.name, tool.risk, Date.now() - startedAt, normalizeError(error));
  }

  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<ToolResult>((resolve) => {
      timer = setTimeout(() => resolve({
        ok: false,
        error: 'TOOL_TIMEOUT',
        metadata: { toolName: tool.name, risk: tool.risk, durationMs: Date.now() - startedAt },
      }), safeTimeout);
    });

    const result = await Promise.race([tool.execute(input, context), timeout]);
    return {
      ...result,
      metadata: {
        toolName: tool.name,
        risk: tool.risk,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error: unknown) {
    return failure(tool.name, tool.risk, Date.now() - startedAt, normalizeError(error));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
