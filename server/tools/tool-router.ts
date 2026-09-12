import { assertToolInput, getTool } from './tool-registry.ts';
import { executeTool } from './tool-executor.ts';
import { verifyToolResult } from './tool-verifier.ts';
import type { ToolContext, ToolInput, ToolResult, ToolErrorCode } from './tool-types.ts';
import type { ToolCapability } from './tool-capabilities.ts';

export interface ToolPermissionPolicy {
  readonly allowed: readonly string[];
  readonly capabilities?: readonly ToolCapability[];
  readonly allowWrite?: boolean;
  readonly allowExternal?: boolean;
}

export interface RouteResult extends ToolResult { readonly verified: boolean; }

function denied(name: string, code: ToolErrorCode, message: string): RouteResult {
  return { ok: false, verified: false, error: `${message}:${name}`, errorCode: code, retryable: false };
}

export async function routeTool(name: string, input: ToolInput, context: ToolContext, policy: ToolPermissionPolicy, timeoutMs?: number): Promise<RouteResult> {
  const normalizedName = name.trim();
  try {
    assertToolInput(input);
  } catch {
    return { ok: false, verified: false, error: 'Tool input is invalid', errorCode: 'INVALID_INPUT', retryable: false };
  }
  if (normalizedName.length === 0) return denied(name, 'INVALID_NAME', 'Tool name is required');
  if (!policy.allowed.includes(normalizedName)) return denied(normalizedName, 'PERMISSION_DENIED', 'Tool permission denied');

  try {
    const tool = getTool(normalizedName);
    if (tool.capability !== undefined && policy.capabilities !== undefined && !policy.capabilities.includes(tool.capability as ToolCapability)) {
      return denied(normalizedName, 'CAPABILITY_DENIED', 'Tool capability denied');
    }
    if (tool.risk === 'write' && policy.allowWrite !== true) return denied(normalizedName, 'WRITE_NOT_ALLOWED', 'Tool write access is not allowed');
    if (tool.risk === 'external' && policy.allowExternal !== true) return denied(normalizedName, 'EXTERNAL_NOT_ALLOWED', 'Tool external access is not allowed');
  } catch {
    return denied(normalizedName, 'NOT_FOUND', 'Tool not found');
  }

  const result = await executeTool(normalizedName, input, context, timeoutMs);
  const verification = verifyToolResult(result);
  if (!verification.ok) {
    return {
      ...result,
      ok: false,
      verified: false,
      error: verification.error,
      errorCode: verification.errorCode ?? result.errorCode ?? 'VERIFICATION_FAILED',
      retryable: verification.retryable ?? result.retryable ?? false,
    };
  }
  return { ...result, ok: true, verified: true };
}
