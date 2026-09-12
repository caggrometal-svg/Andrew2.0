import { assertToolInput, getTool } from './tool-registry.mjs';
import { executeTool } from './tool-executor.mjs';
import { verifyToolResult } from './tool-verifier.mjs';

function denied(name, errorCode, message) {
  return { ok: false, verified: false, error: `${message}:${name}`, errorCode, retryable: false };
}

export async function routeTool(name, input, context, policy, timeoutMs) {
  const normalizedName = name.trim();
  try { assertToolInput(input); }
  catch { return { ok: false, verified: false, error: 'Tool input is invalid', errorCode: 'INVALID_INPUT', retryable: false }; }
  if (normalizedName.length === 0) return denied(name, 'INVALID_NAME', 'Tool name is required');
  if (!policy.allowed.includes(normalizedName)) return denied(normalizedName, 'PERMISSION_DENIED', 'Tool permission denied');
  try {
    const tool = getTool(normalizedName);
    if (tool.capability !== undefined && policy.capabilities !== undefined && !policy.capabilities.includes(tool.capability)) return denied(normalizedName, 'CAPABILITY_DENIED', 'Tool capability denied');
    if (tool.risk === 'write' && policy.allowWrite !== true) return denied(normalizedName, 'WRITE_NOT_ALLOWED', 'Tool write access is not allowed');
    if (tool.risk === 'external' && policy.allowExternal !== true) return denied(normalizedName, 'EXTERNAL_NOT_ALLOWED', 'Tool external access is not allowed');
  } catch { return denied(normalizedName, 'NOT_FOUND', 'Tool not found'); }
  const result = await executeTool(normalizedName, input, context, timeoutMs);
  const verification = verifyToolResult(result);
  if (!verification.ok) return { ...result, ok: false, verified: false, error: verification.error, errorCode: verification.errorCode ?? result.errorCode ?? 'VERIFICATION_FAILED', retryable: verification.retryable ?? result.retryable ?? false };
  return { ...result, ok: true, verified: true };
}
