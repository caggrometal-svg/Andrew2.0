import { assertToolInput, getTool } from './tool-registry';
import { executeTool } from './tool-executor';
import { verifyToolResult } from './tool-verifier';
import type { ToolContext, ToolInput, ToolResult } from './tool-types';

export interface ToolPermissionPolicy {
  readonly allowed: readonly string[];
  readonly allowWrite?: boolean;
  readonly allowExternal?: boolean;
}

export interface RouteResult extends ToolResult { readonly verified: boolean; }

function denied(name: string, reason = 'TOOL_PERMISSION_DENIED'): RouteResult {
  return { ok: false, verified: false, error: `${reason}:${name}` };
}

export async function routeTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
  policy: ToolPermissionPolicy,
  timeoutMs?: number,
): Promise<RouteResult> {
  const normalizedName = name.trim();
  try { assertToolInput(input); } catch (error: unknown) {
    return { ok: false, verified: false, error: error instanceof Error ? error.message : 'TOOL_INVALID_INPUT' };
  }

  if (!policy.allowed.includes(normalizedName)) return denied(normalizedName);

  try {
    const tool = getTool(normalizedName);
    if (tool.risk === 'write' && policy.allowWrite !== true) return denied(normalizedName, 'TOOL_WRITE_NOT_ALLOWED');
    if (tool.risk === 'external' && policy.allowExternal !== true) return denied(normalizedName, 'TOOL_EXTERNAL_NOT_ALLOWED');
  } catch (error: unknown) {
    return denied(normalizedName, error instanceof Error ? error.message : 'TOOL_NOT_ALLOWED');
  }

  const result = await executeTool(normalizedName, input, context, timeoutMs);
  const verification = verifyToolResult(result);
  return {
    ...result,
    ok: result.ok && verification.ok,
    verified: verification.ok,
    error: verification.ok ? result.error : verification.error,
  };
}
