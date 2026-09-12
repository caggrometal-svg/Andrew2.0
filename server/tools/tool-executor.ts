import { getTool } from './tool-registry';
import { recordToolExecution } from '../observability/runtime-metrics.mjs';
import type { ToolContext, ToolInput, ToolResult, ToolRisk, ToolErrorCode } from './tool-types';

const DEFAULT_TIMEOUT_MS = 10_000;

type TimeoutSignal = Error & { code: 'TIMEOUT' };

function failure(name: string, risk: ToolRisk, durationMs: number, code: ToolErrorCode, message: string, retryable: boolean): ToolResult {
  recordToolExecution({ toolName: name, durationMs, ok: false, errorCode: code, phase: 'executor' });
  return { ok: false, error: message, errorCode: code, retryable, metadata: { toolName: name, risk, durationMs } };
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Tool execution failed';
}

export async function executeTool(name: string, input: ToolInput, context: ToolContext, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ToolResult> {
  const startedAt = Date.now();
  const normalizedName = name.trim();
  if (normalizedName.length === 0) return failure(name, 'read', 0, 'INVALID_NAME', 'Tool name is required', false);
  let tool;
  try { tool = getTool(normalizedName); }
  catch { return failure(normalizedName, 'read', Date.now() - startedAt, 'NOT_FOUND', 'Tool not found', false); }
  try { tool.validate(input); }
  catch (error: unknown) { return failure(tool.name, tool.risk, Date.now() - startedAt, 'INVALID_INPUT', normalizeError(error), false); }
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<ToolResult>((_, reject) => {
      const signal = Object.assign(new Error('Tool execution timed out'), { code: 'TIMEOUT' as const }) as TimeoutSignal;
      timer = setTimeout(() => reject(signal), safeTimeout);
    });
    const result = await Promise.race([tool.execute(input, context), timeout]);
    const durationMs = Date.now() - startedAt;
    recordToolExecution({ toolName: tool.name, durationMs, ok: result.ok === true, errorCode: result.errorCode, phase: 'executor' });
    return { ...result, metadata: { toolName: tool.name, risk: tool.risk, durationMs } };
  } catch (error: unknown) {
    const durationMs = Date.now() - startedAt;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'TIMEOUT') return failure(tool.name, tool.risk, durationMs, 'TIMEOUT', 'Tool execution timed out', true);
    return failure(tool.name, tool.risk, durationMs, 'EXECUTION_FAILED', normalizeError(error), true);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
