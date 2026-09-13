export const ANDREW_PROVIDER_CONTRACT_VERSION = '1.0.0';
export const ANDREW_USAGE_POLICY = 'unlimited-app';

const ROLES = new Set(['system', 'user', 'assistant']);

export function createProviderRequest({ input = [], memory = [], metadata = {} } = {}) {
  if (!Array.isArray(input)) throw new TypeError('AndrewProviderContract.input must be an array');
  const normalizedInput = input.filter((item) => item && ROLES.has(item.role)).map((item) => ({
    role: item.role,
    content: item.content,
  }));
  return Object.freeze({
    contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
    input: normalizedInput,
    memory: Array.isArray(memory) ? memory.slice() : [],
    metadata: { ...metadata },
  });
}

export function createProviderResponse({ text, provider, model = null, requestId = null, finishReason = 'stop', usage = null, latencyMs = null } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('AndrewProviderContract.text must be a non-empty string');
  if (typeof provider !== 'string' || !provider.trim()) throw new TypeError('AndrewProviderContract.provider is required');
  return Object.freeze({
    contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
    text: text.trim(),
    provider,
    model: typeof model === 'string' && model ? model : null,
    requestId: typeof requestId === 'string' && requestId ? requestId : null,
    finishReason,
    usage: usage && typeof usage === 'object' ? { ...usage } : null,
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
  });
}

export function createAvailabilityContract({ tierStates = {}, providerCount = 0 } = {}) {
  return Object.freeze({
    contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
    serviceIdentity: 'Andrew 3.0',
    usagePolicy: ANDREW_USAGE_POLICY,
    appEnforcedQuota: false,
    providerCount,
    tiers: { ...tierStates },
  });
}
