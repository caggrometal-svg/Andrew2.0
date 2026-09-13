export const ANDREW_PROVIDER_CONTRACT_VERSION = '1.0.0';
export const ANDREW_USAGE_POLICY = 'unlimited-app';
export const ANDREW_SERVICE_IDENTITY = 'Andrew 3.0';

const ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MEMORY_ENTRIES = 64;
const MAX_MEMORY_CHARS = 4_000;
const MAX_TEXT_CHARS = 120_000;

function normalizeContent(content) {
  if (typeof content === 'string') return content.slice(0, MAX_TEXT_CHARS);
  if (!Array.isArray(content)) throw new TypeError('AndrewProviderContract.content must be a string or content-part array');
  return content.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];
    if (part.type === 'input_text' && typeof part.text === 'string') return [{ type: 'input_text', text: part.text.slice(0, MAX_TEXT_CHARS) }];
    if (part.type === 'input_image' && typeof part.image_url === 'string') return [{ type: 'input_image', image_url: part.image_url }];
    return [];
  });
}

export function normalizeProviderInput(input) {
  if (!Array.isArray(input)) throw new TypeError('AndrewProviderContract.input must be an array');
  return input.filter((item) => item && typeof item === 'object' && ROLES.has(item.role)).map((item) => ({
    role: item.role,
    content: normalizeContent(item.content),
  }));
}

export function createProviderRequest({ input = [], memory = [], metadata = {} } = {}) {
  const normalizedInput = normalizeProviderInput(input);
  const normalizedMemory = Array.isArray(memory)
    ? memory.filter((value) => typeof value === 'string' && value.trim()).slice(0, MAX_MEMORY_ENTRIES).map((value) => value.trim().slice(0, MAX_MEMORY_CHARS))
    : [];
  if (metadata !== null && typeof metadata !== 'object') throw new TypeError('AndrewProviderContract.metadata must be an object');
  return Object.freeze({
    contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
    input: normalizedInput,
    memory: normalizedMemory,
    metadata: { ...(metadata || {}) },
  });
}

export function createProviderResponse({ text, provider, model = null, requestId = null, finishReason = 'stop', usage = null, latencyMs = null } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('AndrewProviderContract.text must be a non-empty string');
  if (typeof provider !== 'string' || !provider.trim()) throw new TypeError('AndrewProviderContract.provider is required');
  if (model !== null && typeof model !== 'string') throw new TypeError('AndrewProviderContract.model must be string or null');
  if (requestId !== null && typeof requestId !== 'string') throw new TypeError('AndrewProviderContract.requestId must be string or null');
  if (usage !== null && (typeof usage !== 'object' || Array.isArray(usage))) throw new TypeError('AndrewProviderContract.usage must be object or null');
  return Object.freeze({
    contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
    text: text.trim().slice(0, MAX_TEXT_CHARS),
    provider: provider.trim(),
    model: typeof model === 'string' && model.trim() ? model.trim() : null,
    requestId: typeof requestId === 'string' && requestId.trim() ? requestId.trim() : null,
    finishReason: typeof finishReason === 'string' && finishReason ? finishReason : 'stop',
    usage: usage ? { ...usage } : null,
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : null,
  });
}

export function createAvailabilityContract({ tierStates = {}, providerCount = 0 } = {}) {
  if (!tierStates || typeof tierStates !== 'object' || Array.isArray(tierStates)) throw new TypeError('AndrewProviderContract.tierStates must be an object');
  return Object.freeze({
    contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
    serviceIdentity: ANDREW_SERVICE_IDENTITY,
    usagePolicy: ANDREW_USAGE_POLICY,
    appEnforcedQuota: false,
    providerCount: Number.isInteger(providerCount) && providerCount >= 0 ? providerCount : 0,
    tiers: { ...tierStates },
  });
}
