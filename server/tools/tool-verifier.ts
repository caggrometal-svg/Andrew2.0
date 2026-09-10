import type { ToolResult } from './tool-types';

export interface VerificationResult {
  readonly ok: boolean;
  readonly error?: string;
}

export function verifyToolResult(result: ToolResult): VerificationResult {
  if (result.ok === false) return { ok: false, error: result.error ?? 'TOOL_RESULT_FAILED' };
  if (result.ok !== true) return { ok: false, error: 'TOOL_RESULT_INVALID' };
  return { ok: true };
}
