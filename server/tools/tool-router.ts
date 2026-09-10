import { assertToolInput } from './tool-registry';
import { executeTool } from './tool-executor';
import { verifyToolResult } from './tool-verifier';
import type { ToolContext, ToolInput, ToolResult } from './tool-types';

export interface ToolPermissionPolicy {
  readonly allowed: readonly string[];
  readonly allowWrite?: boolean;
  readonly allowExternal?: boolean;
}

export interface RouteResult extends ToolResult {
  readonly verified: boolean;
}

function denied(name: string): RouteResult {
  return { ok: false, verified: false, error: `TOOL_PERMISSION_DENIED:${name}` };
}

export async function routeTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
  policy: ToolPermissionPolicy,
  timeoutMs?: number,
): Promise<RouteResult> {
  try {
    assertToolInput(input);
  } catch (error: unknown) {
    return { ok: false, verified: false, error: error instanceof Error ? error.message : 'TOOL_INVALID_INPUT' };
  }

  if (!policy.allowed.includes(name.trim())) return denied(name.trim());

  const result = await executeTool(name, input, context, timeoutMs);
  const verification = verifyToolResult(result);
  return {
    ...result,
    ok: result.ok && verification.ok,
    verified: verification.ok,
    error: verification.ok ? result.error : verification.error,
  };
}
