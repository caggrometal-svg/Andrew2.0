export function verifyToolResult(result) {
  if (result.ok === false) return { ok: false, error: result.error ?? 'TOOL_RESULT_FAILED' };
  if (result.ok !== true) return { ok: false, error: 'TOOL_RESULT_INVALID' };
  return { ok: true };
}
