import { getTool } from './tool-registry.mjs';
import { recordToolExecution } from '../observability/runtime-metrics.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

function failure(name, risk, durationMs, errorCode, error, retryable) {
  const result = { ok: false, error, errorCode, retryable, metadata: { toolName: name, risk, durationMs } };
  recordToolExecution({ toolName: name, durationMs, ok: false, errorCode, phase: 'executor' });
  return result;
}

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Tool execution failed';
}

export async function executeTool(name, input, context, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  const normalizedName = name.trim();
  if (normalizedName.length === 0) return failure(name, 'read', 0, 'INVALID_NAME', 'Tool name is required', false);
  let tool;
  try { tool = getTool(normalizedName); }
  catch { return failure(normalizedName, 'read', Date.now() - startedAt, 'NOT_FOUND', 'Tool not found', false); }
  try { tool.validate(input); }
  catch (error) { return failure(tool.name, tool.risk, Date.now() - startedAt, 'INVALID_INPUT', normalizeError(error), false); }
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Tool execution timed out'), { code: 'TIMEOUT' })), safeTimeout);
    });
    const result = await Promise.race([tool.execute(input, context), timeout]);
    const durationMs = Date.now() - startedAt;
    recordToolExecution({ toolName: tool.name, durationMs, ok: result.ok === true, errorCode: result.errorCode, phase: 'executor' });
    return { ...result, metadata: { toolName: tool.name, risk: tool.risk, durationMs } };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error && typeof error === 'object' && error.code === 'TIMEOUT') return failure(tool.name, tool.risk, durationMs, 'TIMEOUT', 'Tool execution timed out', true);
    return failure(tool.name, tool.risk, durationMs, 'EXECUTION_FAILED', normalizeError(error), true);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
