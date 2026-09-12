import { recordToolExecution } from '../observability/runtime-metrics.mjs';
import type { ToolErrorCode, ToolResult } from './tool-types';

export interface VerificationResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly errorCode?: Extract<ToolErrorCode, 'RESULT_INVALID' | 'VERIFICATION_FAILED'> | ToolErrorCode;
  readonly retryable?: boolean;
}

export function verifyToolResult(result: ToolResult): VerificationResult {
  const toolName = result?.metadata?.toolName ?? 'unknown';
  const durationMs = result?.metadata?.durationMs ?? 0;
  if (result === null || typeof result !== 'object') {
    recordToolExecution({ toolName, durationMs: 0, ok: false, errorCode: 'RESULT_INVALID', phase: 'verifier' });
    return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  }
  if (result.ok === false) {
    const errorCode = result.errorCode ?? 'VERIFICATION_FAILED';
    recordToolExecution({ toolName, durationMs, ok: false, errorCode, phase: 'verifier' });
    return { ok: false, error: result.error ?? 'Tool result failed', errorCode, retryable: result.retryable };
  }
  if (result.ok !== true) {
    recordToolExecution({ toolName, durationMs, ok: false, errorCode: 'RESULT_INVALID', phase: 'verifier' });
    return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  }
  recordToolExecution({ toolName, durationMs, ok: true, phase: 'verifier' });
  return { ok: true };
}
