import type { ToolErrorCode, ToolResult } from './tool-types';

export interface VerificationResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly errorCode?: Extract<ToolErrorCode, 'RESULT_INVALID' | 'VERIFICATION_FAILED'>;
  readonly retryable?: boolean;
}

export function verifyToolResult(result: ToolResult): VerificationResult {
  if (result === null || typeof result !== 'object') {
    return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  }
  if (result.ok === false) {
    return { ok: false, error: result.error ?? 'Tool result failed', errorCode: result.errorCode as ToolErrorCode | undefined, retryable: result.retryable } as VerificationResult;
  }
  if (result.ok !== true) {
    return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  }
  return { ok: true };
}
