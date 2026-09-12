export function verifyToolResult(result) {
  if (result === null || typeof result !== 'object') return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  if (result.ok === false) return { ok: false, error: result.error ?? 'Tool result failed', errorCode: result.errorCode, retryable: result.retryable };
  if (result.ok !== true) return { ok: false, error: 'Tool result is invalid', errorCode: 'RESULT_INVALID', retryable: false };
  return { ok: true };
}
