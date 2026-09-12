import { assertToolInput, getTool } from './tool-registry.mjs';
import { executeTool } from './tool-executor.mjs';
import { verifyToolResult } from './tool-verifier.mjs';
import { recordRouterRequest } from '../observability/runtime-metrics.mjs';

function denied(name, errorCode, message, startedAt) {
  const durationMs = Date.now() - startedAt;
  recordRouterRequest({ durationMs, ok: false, errorCode });
  return { ok: false, verified: false, error: `${message}:${name}`, errorCode, retryable: false };
}

export async function routeTool(name, input, context, policy, timeoutMs) {
  const startedAt = Date.now();
  const normalizedName = name.trim();
  try { assertToolInput(input); }
  catch { return denied(normalizedName, 'INVALID_INPUT', 'Tool input is invalid', startedAt); }
  if (normalizedName.length === 0) return denied(name, 'INVALID_NAME', 'Tool name is required', startedAt);
  if (!policy.allowed.includes(normalizedName)) return denied(normalizedName, 'PERMISSION_DENIED', 'Tool permission denied', startedAt);
  try {
    const tool = getTool(normalizedName);
    if (tool.capability !== undefined && policy.capabilities !== undefined && !policy.capabilities.includes(tool.capability)) return denied(normalizedName, 'CAPABILITY_DENIED', 'Tool capability denied', startedAt);
    if (tool.risk === 'write' && policy.allowWrite !== true) return denied(normalizedName, 'WRITE_NOT_ALLOWED', 'Tool write access is not allowed', startedAt);
    if (tool.risk === 'external' && policy.allowExternal !== true) return denied(normalizedName, 'EXTERNAL_NOT_ALLOWED', 'Tool external access is not allowed', startedAt);
  } catch { return denied(normalizedName, 'NOT_FOUND', 'Tool not found', startedAt); }
  const result = await executeTool(normalizedName, input, context, timeoutMs);
  const verification = verifyToolResult(result);
  const durationMs = Date.now() - startedAt;
  if (!verification.ok) {
    const errorCode = verification.errorCode ?? result.errorCode ?? 'VERIFICATION_FAILED';
    recordRouterRequest({ durationMs, ok: false, errorCode });
    return { ...result, ok: false, verified: false, error: verification.error, errorCode, retryable: verification.retryable ?? result.retryable ?? false };
  }
  recordRouterRequest({ durationMs, ok: true });
  return { ...result, ok: true, verified: true };
}
