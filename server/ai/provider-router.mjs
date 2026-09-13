import crypto from 'node:crypto';
import { config } from '../config.mjs';
import {
  createProviderRequest,
  createProviderResponse,
  createAvailabilityContract,
} from './andrew-provider-contract.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;
const TRANSIENT_MAX_ATTEMPTS = 2;
const RETRY_BASE_MS = 250;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const HEALTH_LATENCY_TARGET_MS = 4_000;
const GLOBAL_UNAVAILABLE_ERROR = 'Servicio no disponible temporalmente';
const TIER_ORDER = [1, 2, 3, 4];
const DEFAULT_TIER_BY_PROVIDER = Object.freeze({
  primary: 1,
  secondary: 1,
  anthropic: 2,
  gemini: 2,
  deepseek: 3,
  groq: 3,
  local: 4,
  edge: 4,
});

export class AIProviderError extends Error {
  constructor(message, { provider, status = null, retryable = false, permanent = false, rateLimited = false, code = null, cause } = {}) {
    super(message, { cause });
    this.name = 'AIProviderError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.permanent = permanent;
    this.rateLimited = rateLimited;
    this.code = code;
  }
}

export class AIServiceUnavailableError extends Error {
  constructor(cause = null) {
    super(GLOBAL_UNAVAILABLE_ERROR, { cause: cause || undefined });
    this.name = 'AIServiceUnavailableError';
    this.code = 'AI_SERVICE_UNAVAILABLE';
    this.status = 503;
    this.retryable = true;
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function permanentStatus(status) {
  return [400, 401, 403, 404, 405, 406, 415, 422].includes(Number(status));
}

function retryableStatus(status) {
  const value = Number(status);
  return value === 408 || value === 409 || value >= 500;
}

function rateLimitMessage(message) {
  return /rate[ -]?limit|rate_limit|rpd|requests per day|quota(?:[_ -]?(?:exhausted|exceeded|limit))?|insufficient(?:[_ -]?quota)?/i.test(String(message || ''));
}

function isRateLimitStatus(status) {
  return Number(status) === 429;
}

function hasMedia(request) {
  return Boolean(
    request?.attachment?.type ||
    (request?.input || []).some((item) => Array.isArray(item?.content) && item.content.some((part) => part?.type === 'input_image')),
  );
}

function configured(name) {
  if (name === 'primary') return Boolean(config.openaiApiKey && config.primaryEndpoint && config.openaiModel);
  if (name === 'secondary') return Boolean(config.secondaryApiKey && config.secondaryEndpoint && config.secondaryModel);
  const provider = config.providers?.[name];
  return Boolean(provider?.apiKey && provider?.endpoint && provider?.model);
}

function providerConfig(name) {
  if (name === 'primary') {
    return {
      apiKey: config.openaiApiKey,
      endpoint: config.primaryEndpoint,
      model: config.openaiModel,
      protocol: 'responses',
      supportsVision: true,
      tier: config.tiers?.primary?.tier ?? DEFAULT_TIER_BY_PROVIDER.primary,
    };
  }
  if (name === 'secondary') {
    return {
      apiKey: config.secondaryApiKey,
      endpoint: config.secondaryEndpoint,
      model: config.secondaryModel,
      protocol: 'chat',
      supportsVision: config.secondarySupportsVision,
      tier: config.tiers?.secondary?.tier ?? DEFAULT_TIER_BY_PROVIDER.secondary,
    };
  }
  const provider = config.providers?.[name];
  return provider ? { ...provider, tier: provider.tier ?? config.tiers?.[name]?.tier ?? DEFAULT_TIER_BY_PROVIDER[name] ?? 3 } : null;
}

function providerNames() {
  return ['primary', 'secondary', ...Object.keys(config.providers || {})];
}

function supportsMedia(name) {
  return Boolean(providerConfig(name)?.supportsVision);
}

function providerTier(name) {
  return Number(providerConfig(name)?.tier || DEFAULT_TIER_BY_PROVIDER[name] || 3);
}

function providerScore(name, state) {
  if (!configured(name) || state.openUntil > Date.now()) return 0;
  const failurePenalty = Math.min(45, state.consecutiveFailures * 15);
  const permanentPenalty = state.permanentFailures > 0 ? 35 : 0;
  const latencyPenalty = state.latencyEwmaMs ? Math.min(35, Math.round((state.latencyEwmaMs / HEALTH_LATENCY_TARGET_MS) * 35)) : 0;
  const recentSuccessBonus = state.lastSuccessAt && Date.now() - state.lastSuccessAt < 120_000 ? 8 : 0;
  return Math.max(1, Math.min(100, 100 - failurePenalty - permanentPenalty - latencyPenalty + recentSuccessBonus));
}

function policyOrder(request, health) {
  const candidates = providerNames()
    .filter(configured)
    .filter((name) => !hasMedia(request) || supportsMedia(name));
  if (!candidates.length) return [];

  const preferred = config.routingPolicy === 'primary'
    ? ['primary', 'secondary', 'anthropic', 'gemini', 'deepseek', 'groq', 'local', 'edge']
    : ['secondary', 'primary', 'deepseek', 'groq', 'gemini', 'anthropic', 'local', 'edge'];

  const ordered = [...preferred.filter((name) => candidates.includes(name)), ...candidates.filter((name) => !preferred.includes(name))];
  return ordered.sort((a, b) => {
    const tierDiff = providerTier(a) - providerTier(b);
    if (tierDiff !== 0) return tierDiff;
    const scoreDiff = providerScore(b, health.get(b) || createHealthState()) - providerScore(a, health.get(a) || createHealthState());
    return scoreDiff !== 0 ? scoreDiff : ordered.indexOf(a) - ordered.indexOf(b);
  });
}

function createHealthState() {
  return {
    successes: 0,
    failures: 0,
    rateLimited: 0,
    permanentFailures: 0,
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastStatus: null,
    lastErrorClass: null,
    latencyEwmaMs: null,
    openUntil: 0,
    halfOpen: false,
    probeInFlight: false,
    lastHealthCheckAt: null,
  };
}

function providerErrorFromResponse(provider, response, data) {
  const message = data?.error?.message || data?.message || `${provider} HTTP ${response.status}`;
  const rateLimited = isRateLimitStatus(response.status) || rateLimitMessage(message);
  const permanent = permanentStatus(response.status) && !rateLimited;
  return new AIProviderError(message, {
    provider,
    status: response.status,
    retryable: rateLimited || retryableStatus(response.status),
    permanent,
    rateLimited,
    code: rateLimited ? 'RATE_LIMITED_OR_QUOTA' : null,
  });
}

async function fetchJson(url, options, provider, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 1; attempt <= TRANSIENT_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const error = providerErrorFromResponse(provider, response, data);
      if (error.rateLimited || !error.retryable || attempt === TRANSIENT_MAX_ATTEMPTS) throw error;
      lastError = error;
      const retryAfter = Number(response.headers.get('retry-after'));
      const base = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5_000)
        : RETRY_BASE_MS * (2 ** (attempt - 1));
      await sleep(base + Math.floor(Math.random() * Math.max(1, base * 0.25)));
    } catch (error) {
      if (error instanceof AIProviderError) {
        if (error.rateLimited || !error.retryable || attempt === TRANSIENT_MAX_ATTEMPTS) throw error;
        lastError = error;
      } else {
        lastError = new AIProviderError(error instanceof Error ? error.message : String(error), {
          provider,
          retryable: true,
          code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          cause: error,
        });
        if (attempt === TRANSIENT_MAX_ATTEMPTS) throw lastError;
      }
      await sleep(RETRY_BASE_MS * (2 ** (attempt - 1)) + Math.floor(Math.random() * 100));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new AIProviderError(`${provider} request failed`, { provider, retryable: true });
}

function dataUrlParts(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  return match ? { mediaType: match[1], data: match[2] } : null;
}

function toChatContent(input, supportsVision) {
  const messages = [];
  for (const item of input || []) {
    if (!item || !['user', 'assistant', 'system'].includes(item.role)) continue;
    if (typeof item.content === 'string') {
      messages.push({ role: item.role, content: item.content });
      continue;
    }
    if (!Array.isArray(item.content)) continue;
    const content = item.content.flatMap((part) => {
      if (part?.type === 'input_text' && typeof part.text === 'string') return [{ type: 'text', text: part.text }];
      if (part?.type === 'input_image' && supportsVision) return [{ type: 'image_url', image_url: { url: part.image_url } }];
      return [];
    });
    if (content.length) messages.push({ role: item.role, content });
  }
  return messages;
}

function toAnthropicMessages(input) {
  return (input || [])
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => {
      if (typeof item.content === 'string') return { role: item.role, content: item.content };
      const content = (item.content || []).flatMap((part) => {
        if (part?.type === 'input_text' && typeof part.text === 'string') return [{ type: 'text', text: part.text }];
        if (part?.type === 'input_image') {
          const parsed = dataUrlParts(part.image_url);
          return parsed ? [{ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } }] : [];
        }
        return [];
      });
      return { role: item.role, content };
    });
}

function historyMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .slice(-40)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 12000) }));
}

function normalizeRequest(request) {
  const source = request && typeof request === 'object' ? request : {};
  const contract = createProviderRequest({ input: Array.isArray(source.input) ? source.input : [], memory: source.memory, metadata: source.metadata });
  const history = historyMessages(source.history);
  if (!history.length) return { ...source, input: contract.input, memory: contract.memory, metadata: contract.metadata };
  const existing = new Set(contract.input.filter((item) => typeof item.content === 'string').map((item) => `${item.role}\u0000${item.content}`));
  const missing = history.filter((item) => !existing.has(`${item.role}\u0000${item.content}`));
  return {
    ...source,
    input: missing.length ? [...missing, ...contract.input] : contract.input,
    memory: contract.memory,
    metadata: contract.metadata,
  };
}

function memoryMessages(memory) {
  if (!Array.isArray(memory) || memory.length === 0) return [];
  const entries = memory.filter((value) => typeof value === 'string' && value.trim()).slice(0, 24).map((value) => value.trim().slice(0, 1000));
  return entries.length ? [{ role: 'system', content: `Memoria compartida de Andrew:\n${entries.join('\n')}` }] : [];
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data?.output) ? data.output.flatMap((item) => Array.isArray(item?.content) ? item.content : []) : [];
  const outputText = output.filter((item) => item?.type === 'output_text' && typeof item.text === 'string').map((item) => item.text).join('\n').trim();
  if (outputText) return outputText;
  const choice = data?.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) return choice.trim();
  if (Array.isArray(choice)) return choice.filter((item) => typeof item?.text === 'string').map((item) => item.text).join('\n').trim();
  return '';
}

function extractAnthropicText(data) {
  return (data?.content || []).filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text).join('\n').trim();
}

function logEvent(event, fields = {}) {
  console.info(JSON.stringify({ event, timestamp: new Date().toISOString(), ...fields }));
}

export class ProviderRouter {
  #cache = new Map();
  #health = new Map(providerNames().map((name) => [name, createHealthState()]));
  #activeRequests = 0;
  #waiters = [];

  async execute(request) {
    const normalizedRequest = normalizeRequest(request);
    await this.#acquireSlot();
    try {
      const key = hash({ prompt: normalizedRequest.prompt, history: normalizedRequest.history || [], input: normalizedRequest.input || [], memory: normalizedRequest.memory || [], temperature: normalizedRequest.temperature ?? null, attachment: normalizedRequest.attachment || null });
      const cached = this.#getCache(key);
      if (cached) return { ...cached, provider: 'cache', latencyMs: 0 };

      const started = Date.now();
      const failures = [];
      const candidates = policyOrder(normalizedRequest, this.#health);
      for (const name of candidates) {
        if (!this.#canAttempt(name)) continue;
        const health = this.#health.get(name);
        if (health?.halfOpen) health.probeInFlight = true;
        const providerStarted = Date.now();
        try {
          const result = await this.#executeProvider(name, normalizedRequest);
          this.#recordSuccess(name, Date.now() - providerStarted);
          const output = createProviderResponse({ text: result.text, provider: name, model: result.model, latencyMs: Date.now() - started });
          const response = { text: output.text, provider: output.provider, model: output.model, latencyMs: output.latencyMs, contractVersion: output.contractVersion };
          this.#setCache(key, response);
          logEvent('provider.success', { provider: name, model: result.model, tier: providerTier(name), latencyMs: output.latencyMs });
          return response;
        } catch (error) {
          this.#recordFailure(name, error, Date.now() - providerStarted);
          failures.push(error);
        } finally {
          const current = this.#health.get(name);
          if (current) current.probeInFlight = false;
        }
      }
      logEvent('provider.router.exhausted', { providers: candidates, failures: failures.map((error) => ({ provider: error?.provider || null, status: error?.status || null, code: error?.code || null })) });
      throw new AIServiceUnavailableError(failures.at(-1) || null);
    } finally {
      this.#releaseSlot();
    }
  }

  async healthCheck(name) {
    if (!this.#health.has(name) || !configured(name)) return { provider: name, ok: false, reason: 'not-configured' };
    const started = Date.now();
    try {
      await this.#executeProvider(name, { input: [{ role: 'user', content: 'health-check' }], memory: [], prompt: 'health-check' });
      const latencyMs = Date.now() - started;
      this.#recordSuccess(name, latencyMs);
      this.#health.get(name).lastHealthCheckAt = Date.now();
      return { provider: name, ok: true, latencyMs };
    } catch (error) {
      this.#recordFailure(name, error, Date.now() - started);
      this.#health.get(name).lastHealthCheckAt = Date.now();
      return { provider: name, ok: false, latencyMs: Date.now() - started, status: error?.status || null, code: error?.code || null };
    }
  }

  async healthCheckAll() {
    return Promise.all(providerNames().map((name) => this.healthCheck(name)));
  }

  getAvailability() {
    const tiers = Object.fromEntries(TIER_ORDER.map((tier) => [String(tier), { tier, providers: [], healthy: 0 }]));
    for (const name of providerNames()) {
      const tier = providerTier(name);
      const state = this.#health.get(name) || createHealthState();
      const entry = tiers[String(tier)] || (tiers[String(tier)] = { tier, providers: [], healthy: 0 });
      entry.providers.push({ name, configured: configured(name), score: providerScore(name, state), state: state.openUntil > Date.now() ? 'open' : state.halfOpen ? 'half-open' : 'closed' });
      if (configured(name) && state.openUntil <= Date.now()) entry.healthy += 1;
    }
    return createAvailabilityContract({ tierStates: tiers, providerCount: providerNames().filter(configured).length });
  }

  getHealth() {
    const providers = {};
    for (const [name, state] of this.#health) {
      const open = state.openUntil > Date.now();
      providers[name] = {
        configured: configured(name),
        tier: providerTier(name),
        state: open ? 'open' : state.halfOpen ? 'half-open' : 'closed',
        score: providerScore(name, state),
        protocol: providerConfig(name)?.protocol || 'chat',
        capabilities: { vision: supportsMedia(name) },
        model: providerConfig(name)?.model || null,
        successes: state.successes,
        failures: state.failures,
        rateLimited: state.rateLimited,
        permanentFailures: state.permanentFailures,
        consecutiveFailures: state.consecutiveFailures,
        lastFailureAt: state.lastFailureAt,
        lastSuccessAt: state.lastSuccessAt,
        lastHealthCheckAt: state.lastHealthCheckAt,
        latencyEwmaMs: state.latencyEwmaMs,
        openUntil: open ? state.openUntil : null,
        lastStatus: state.lastStatus,
        lastErrorClass: state.lastErrorClass,
        lastError: state.lastError,
      };
    }
    return { policy: config.routingPolicy, usagePolicy: 'unlimited-app', appEnforcedQuota: false, tiers: this.getAvailability().tiers, providers };
  }

  #canAttempt(name) {
    const state = this.#health.get(name);
    if (!state || !configured(name)) return false;
    const now = Date.now();
    if (state.openUntil > now) return false;
    if (state.openUntil && state.openUntil <= now) {
      if (state.probeInFlight) return false;
      state.halfOpen = true;
      logEvent('provider.breaker.half_open', { provider: name });
    }
    return !state.probeInFlight;
  }

  #recordSuccess(name, latencyMs) {
    const state = this.#health.get(name);
    if (!state) return;
    const wasHalfOpen = state.halfOpen;
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.lastSuccessAt = Date.now();
    state.lastError = null;
    state.lastStatus = null;
    state.lastErrorClass = null;
    state.openUntil = 0;
    state.halfOpen = false;
    state.latencyEwmaMs = state.latencyEwmaMs === null ? latencyMs : (state.latencyEwmaMs * 0.8) + (latencyMs * 0.2);
    if (wasHalfOpen) logEvent('provider.breaker.closed', { provider: name });
  }

  #recordFailure(name, error, latencyMs) {
    const state = this.#health.get(name);
    if (!state) return;
    const rateLimited = Boolean(error?.rateLimited) || isRateLimitStatus(error?.status) || rateLimitMessage(error?.message);
    const permanent = !rateLimited && (Boolean(error?.permanent) || permanentStatus(error?.status));
    state.failures += 1;
    state.lastFailureAt = Date.now();
    state.lastError = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
    state.lastStatus = error?.status ?? null;
    state.lastErrorClass = rateLimited ? 'rate-limited-or-quota' : permanent ? 'permanent' : error?.retryable ? 'transient' : 'unknown';
    state.latencyEwmaMs = state.latencyEwmaMs === null ? latencyMs : (state.latencyEwmaMs * 0.8) + (latencyMs * 0.2);
    state.halfOpen = false;
    if (rateLimited) {
      state.rateLimited += 1;
      state.consecutiveFailures += 1;
      state.openUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      logEvent('provider.rate_limited', { provider: name, status: error?.status || 429, cooldownMs: RATE_LIMIT_COOLDOWN_MS });
      return;
    }
    if (permanent) {
      state.permanentFailures += 1;
      state.consecutiveFailures = 0;
      state.openUntil = 0;
      return;
    }
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= BREAKER_THRESHOLD) {
      state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      logEvent('provider.breaker.open', { provider: name, reason: 'transient-failures', openUntil: state.openUntil });
    }
  }

  async #acquireSlot() {
    const limit = Math.max(1, Number(config.aiMaxConcurrent || 32));
    if (this.#activeRequests < limit) {
      this.#activeRequests += 1;
      return;
    }
    await new Promise((resolve) => this.#waiters.push(resolve));
    this.#activeRequests += 1;
  }

  #releaseSlot() {
    this.#activeRequests = Math.max(0, this.#activeRequests - 1);
    const next = this.#waiters.shift();
    if (next) next();
  }

  #getCache(key) {
    const item = this.#cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp >= CACHE_TTL_MS) {
      this.#cache.delete(key);
      return null;
    }
    return { text: item.text, provider: item.provider, model: item.model, latencyMs: item.latencyMs, contractVersion: item.contractVersion };
  }

  #setCache(key, result) {
    this.#cache.set(key, { ...result, timestamp: Date.now() });
    while (this.#cache.size > MAX_CACHE_ENTRIES) this.#cache.delete(this.#cache.keys().next().value);
  }

  async #executeProvider(name, request) {
    if (name === 'primary') return this.#primary(request);
    if (name === 'anthropic') return this.#anthropic(request);
    return this.#genericChat(name, request);
  }

  async #primary(request) {
    const data = await fetchJson(config.primaryEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.openaiModel, input: request.input, store: false }),
    }, 'primary');
    const text = extractResponseText(data);
    if (!text) throw new AIProviderError('Primary provider returned an empty response', { provider: 'primary', retryable: true });
    return { text, model: config.openaiModel };
  }

  async #anthropic(request) {
    const provider = providerConfig('anthropic');
    const messages = [...memoryMessages(request.memory), ...toAnthropicMessages(request.input)];
    const body = { model: provider.model, max_tokens: Number(process.env.AI_ANTHROPIC_MAX_TOKENS || 2048), messages };
    const data = await fetchJson(provider.endpoint, {
      method: 'POST',
      headers: { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, 'anthropic');
    const text = extractAnthropicText(data);
    if (!text) throw new AIProviderError('Anthropic returned an empty response', { provider: 'anthropic', retryable: true });
    return { text, model: provider.model };
  }

  async #genericChat(name, request) {
    const provider = providerConfig(name);
    if (!provider) throw new AIProviderError(`Provider ${name} is not configured`, { provider: name, permanent: true });
    const messages = [...memoryMessages(request.memory), ...toChatContent(request.input, Boolean(provider.supportsVision))];
    const data = await fetchJson(provider.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: provider.model, messages, temperature: request.temperature ?? 0.2 }),
    }, name);
    const text = extractResponseText(data);
    if (!text) throw new AIProviderError(`${name} returned an empty response`, { provider: name, retryable: true });
    return { text, model: provider.model };
  }
}
