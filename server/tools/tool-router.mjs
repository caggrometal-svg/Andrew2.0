import { assertToolInput, getTool } from './tool-registry.mjs';
import { executeTool } from './tool-executor.mjs';
import { verifyToolResult } from './tool-verifier.mjs';

function denied(name, reason = 'TOOL_PERMISSION_DENIED') {
  return { ok: false, verified: false, error: `${reason}:${name}` };
}

export async function routeTool(name, input, context, policy, timeoutMs) {
  const normalizedName = name.trim();
  try { assertToolInput(input); } catch (error) {
    return { ok: false, verified: false, error: error instanceof Error ? error.message : 'TOOL_INVALID_INPUT' };
  }
  if (!policy.allowed.includes(normalizedName)) return denied(normalizedName);
  try {
    const tool = getTool(normalizedName);
    if (tool.capability !== undefined && policy.capabilities !== undefined && !policy.capabilities.includes(tool.capability)) return denied(normalizedName, 'TOOL_CAPABILITY_DENIED');
    if (tool.risk === 'write' && policy.allowWrite !== true) return denied(normalizedName, 'TOOL_WRITE_NOT_ALLOWED');
    if (tool.risk === 'external' && policy.allowExternal !== true) return denied(normalizedName, 'TOOL_EXTERNAL_NOT_ALLOWED');
  } catch (error) {
    return denied(normalizedName, error instanceof Error ? error.message : 'TOOL_NOT_ALLOWED');
  }
  const result = await executeTool(normalizedName, input, context, timeoutMs);
  const verification = verifyToolResult(result);
  return { ...result, ok: result.ok && verification.ok, verified: verification.ok, error: verification.ok ? result.error : verification.error };
}
