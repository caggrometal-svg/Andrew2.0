import { getTool } from './tool-registry.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'TOOL_EXECUTION_FAILED';
}

function failure(name, risk, durationMs, error) {
  return { ok: false, error, metadata: { toolName: name, risk, durationMs } };
}

export async function executeTool(name, input, context, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let tool;
  try {
    tool = getTool(name);
  } catch (error) {
    return failure(name, 'read', Date.now() - startedAt, normalizeError(error));
  }
  try {
    tool.validate(input);
  } catch (error) {
    return failure(tool.name, tool.risk, Date.now() - startedAt, normalizeError(error));
  }
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'TOOL_TIMEOUT', metadata: { toolName: tool.name, risk: tool.risk, durationMs: Date.now() - startedAt } }), safeTimeout);
    });
    const result = await Promise.race([tool.execute(input, context), timeout]);
    return { ...result, metadata: { toolName: tool.name, risk: tool.risk, durationMs: Date.now() - startedAt } };
  } catch (error) {
    return failure(tool.name, tool.risk, Date.now() - startedAt, normalizeError(error));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
