import { recordToolExecution } from '../observability/runtime-metrics.mjs';

export function verifyToolResult(result) {
  const toolName = result?.metadata?.toolName || 'unknown';
  if (result === null || typeof result !== 'object') {
    recordToolExecution({ toolName, durationMs: 0, ok: false, errorCode: 'RESULT_INVALID', phase: 'verifier' });
    return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  }
  if (result.ok === false) {
    recordToolExecution({ toolName, durationMs: result.metadata?.durationMs || 0, ok: false, errorCode: result.errorCode || 'VERIFICATION_FAILED', phase: 'verifier' });
    return { ok: false, error: result.error ?? 'Tool result failed', errorCode: result.errorCode, retryable: result.retryable };
  }
  if (result.ok !== true) {
    recordToolExecution({ toolName, durationMs: result.metadata?.durationMs || 0, ok: false, errorCode: 'RESULT_INVALID', phase: 'verifier' });
    return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  }
  recordToolExecution({ toolName, durationMs: result.metadata?.durationMs || 0, ok: true, phase: 'verifier' });
  return { ok: true };
}
