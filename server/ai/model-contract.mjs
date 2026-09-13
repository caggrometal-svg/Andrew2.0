export const MODEL_CONTRACT_VERSION = '3.0.0';

function countRoles(input) {
  const counts = { system: 0, user: 0, assistant: 0 };
  for (const item of Array.isArray(input) ? input : []) {
    if (Object.hasOwn(counts, item?.role)) counts[item.role] += 1;
  }
  return counts;
}

export function buildModelMetadata({ model, provider, input = [], outputText = '' }) {
  const safeInput = Array.isArray(input) ? input : [];
  const text = typeof outputText === 'string' ? outputText : '';
  return Object.freeze({
    contractVersion: MODEL_CONTRACT_VERSION,
    model: typeof model === 'string' && model ? model : null,
    provider: typeof provider === 'string' && provider ? provider : null,
    inputMessageCount: safeInput.length,
    inputRoleCounts: countRoles(safeInput),
    outputMessageCount: text ? 1 : 0,
    outputTextChars: text.length,
    deterministicPayload: true,
  });
}
