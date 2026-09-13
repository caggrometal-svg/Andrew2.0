import crypto from 'node:crypto';
import { config } from '../config.mjs';

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

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function permanentStatus(status) { return [400, 401, 403, 404, 405, 406, 415, 422].includes(status); }
function retryableStatus(status) { return status === 408 || status === 409 || status >= 500; }
function rateLimitMessage(message) { return /rate[ -]?limit|rate_limit|rpd|requests per day|quota(?:[_ -]?(?:exhausted|exceeded|limit))?/i.test(String(message || '')); }
function isRateLimitStatus(status) { return Number(status) === 429; }
function hasMedia(request) { return Boolean(request.attachment?.type || (request.input || []).some(item => Array.isArray(item.content) && item.content.some(part => part?.type === 'input_image'))); }

function configured(name) {
  if (name === 'primary') return Boolean(config.openaiApiKey && config.primaryEndpoint && config.openaiModel);
  if (name === 'secondary') return Boolean(config.secondaryApiKey && config.secondaryEndpoint && config.secondaryModel);
  const p = config.providers?.[name];
  return Boolean(p?.apiKey && p?.endpoint && p?.model);
}

function providerConfig(name) {
  if (name === 'primary') return { apiKey: config.openaiApiKey, endpoint: config.primaryEndpoint, model: config.openaiModel, protocol: 'responses', supportsVision: true };
  if (name === 'secondary') return { apiKey: config.secondaryApiKey, endpoint: config.secondaryEndpoint, model: config.secondaryModel, protocol: 'chat', supportsVision: config.secondarySupportsVision };
  return config.providers?.[name];
}

function providerNames() { return ['primary', 'secondary', ...Object.keys(config.providers || {})]; }
function supportsMedia(name) { return Boolean(providerConfig(name)?.supportsVision); }

function providerScore(name, state) {
  if (!configured(name)) return 0;
  if (state.openUntil > Date.now()) return 0;
  const failurePenalty = Math.min(45, state.consecutiveFailures * 15);
  const permanentPenalty = state.permanentFailures > 0 ? 35 : 0;
  const latencyPenalty = state.latencyEwmaMs ? Math.min(35, Math.round((state.latencyEwmaMs / HEALTH_LATENCY_TARGET_MS) * 35)) : 0;
  const recentSuccessBonus = state.lastSuccessAt && Date.now() - state.lastSuccessAt < 120_000 ? 8 : 0;
  return Math.max(1, Math.min(100, 100 - failurePenalty - permanentPenalty - latencyPenalty + recentSuccessBonus));
}

function policyOrder(request, health) {
  const candidates = providerNames().filter(configured).filter(name => !hasMedia(request) || supportsMedia(name));
  if (!candidates.length) return [];
  const media = hasMedia(request);
  let preferred;
  if (config.routingPolicy === 'primary') {
    preferred = ['primary', 'anthropic', 'secondary', 'deepseek', 'groq', 'gemini'];
  } else if (config.routingPolicy === 'secondary') {
    preferred = media ? ['secondary', 'anthropic', 'primary', 'gemini', 'groq', 'deepseek'] : ['secondary', 'deepseek', 'groq', 'gemini', 'anthropic', 'primary'];
  } else {
    preferred = media ? ['primary', 'anthropic', 'gemini', 'secondary', 'deepseek', 'groq'] : ['secondary', 'deepseek', 'groq', 'gemini', 'anthropic', 'primary'];
  }
  const ordered = [...preferred.filter(name => candidates.includes(name)), ...candidates.filter(name => !preferred.includes(name))];
  if (config.routingPolicy !== 'balanced') return ordered;
  return [...ordered].sort((a, b) => {
    const aState = health.get(a) || createHealthState();
    const bState = health.get(b) || createHealthState();
    const scoreDiff = providerScore(b, bState) - providerScore(a, aState);
    return scoreDiff !== 0 ? scoreDiff : ordered.indexOf(a) - ordered.indexOf(b);
  });
}

function createHealthState() {
  return { successes: 0, failures: 0, rateLimited: 0, permanentFailures: 0, consecutiveFailures: 0, lastFailureAt: null, lastSuccessAt: null, lastError: null, lastStatus: null, lastErrorClass: null, latencyEwmaMs: null, openUntil: 0, halfOpen: false, probeInFlight: false };
}

function providerErrorFromResponse(provider, response, data) {
  const message = data?.error?.message || data?.message || `${provider} HTTP ${response.status}`;
  const rateLimited = isRateLimitStatus(response.status) || rateLimitMessage(message);
  const permanent = permanentStatus(response.status) && !rateLimited;
  return new AIProviderError(message, { provider, status: response.status, retryable: rateLimited || retryableStatus(response.status), permanent, rateLimited, code: rateLimited ? 'RATE_LIMITED' : null });
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
      if (error.rateLimited) throw error;
      if (!error.retryable || attempt === TRANSIENT_MAX_ATTEMPTS) throw error;
      lastError = error;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5_000) : RETRY_BASE_MS * (2 ** (attempt - 1));
      await sleep(delay + Math.floor(Math.random() * 100));
    } catch (error) {
      if (error instanceof AIProviderError) {
        if (error.rateLimited || !error.retryable || attempt === TRANSIENT_MAX_ATTEMPTS) throw error;
        lastError = error;
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
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
    if (typeof item.content === 'string') { messages.push({ role: item.role, content: item.content }); continue; }
    if (!Array.isArray(item.content)) continue;
    const content = item.content.flatMap(part => {
      if (part?.type === 'input_text' && typeof part.text === 'string') return [{ type: 'text', text: part.text }];
      if (part?.type === 'input_image' && supportsVision) return [{ type: 'image_url', image_url: { url: part.image_url } }];
      return [];
    });
    if (content.length) messages.push({ role: item.role, content });
  }
  return messages;
}

function toAnthropicMessages(input) {
  return (input || []).filter(item => item && (item.role === 'user' || item.role === 'assistant')).map(item => {
    if (typeof item.content === 'string') return { role: item.role, content: item.content };
    const content = (item.content || []).flatMap(part => {
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

function memoryMessages(memory) {
  if (!Array.isArray(memory) || memory.length === 0) return [];
  const entries = memory.filter(value => typeof value === 'string' && value.trim()).slice(0, 24).map(value => value.trim().slice(0, 1000));
  return entries.length ? [{ role: 'system', content: `Memoria compartida de Andrew:\n${entries.join('\n')}` }] : [];
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data?.output) ? data.output.flatMap(item => Array.isArray(item?.content) ? item.content : []) : [];
  const outputText = output.filter(item => item?.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('\n').trim();
  if (outputText) return outputText;
  const choice = data?.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) return choice.trim();
  if (Array.isArray(choice)) return choice.filter(item => typeof item?.text === 'string').map(item => item.text).join('\n').trim();
  return '';
}

function extractAnthropicText(data) {
  return (data?.content || []).filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n').trim();
}

function logEvent(event, fields = {}) {
  console.info(JSON.stringify({ event, timestamp: new Date().toISOString(), ...fields }));
}

export class ProviderRouter {
  #cache = new Map();
  #health = new Map(providerNames().map(name => [name, createHealthState()]));

  async execute(request) {
    const key = hash({ prompt: request.prompt, history: request.history || [], input: request.input || [], memory: request.memory || [], temperature: request.temperature ?? null, attachment: request.attachment || null });
    const cached = this.#getCache(key);
    if (cached) return { ...cached, provider: 'cache', latencyMs: 0 };
    const started = Date.now();
    const failures = [];
    const candidates = policyOrder(request, this.#health);
    for (const name of candidates) {
      if (!this.#canAttempt(name)) continue;
      const health = this.#health.get(name);
      if (health?.halfOpen) health.probeInFlight = true;
      const providerStarted = Date.now();
      try {
        const result = await this.#executeProvider(name, request);
        this.#recordSuccess(name, Date.now() - providerStarted);
        const output = { text: result.text, provider: name, model: result.model, latencyMs: Date.now() - started };
        this.#setCache(key, output);
        logEvent('provider.success', { provider: name, model: result.model, latencyMs: output.latencyMs });
        return output;
      } catch (error) {
        this.#recordFailure(name, error, Date.now() - providerStarted);
        failures.push(error);
      } finally {
        const current = this.#health.get(name);
        if (current) current.probeInFlight = false;
      }
    }
    logEvent('provider.router.exhausted', { providers: candidates, failures: failures.map(error => ({ provider: error?.provider || null, status: error?.status || null, code: error?.code || null })) });
    throw new AIServiceUnavailableError(failures.at(-1) || null);
  }

  getHealth() {
    const providers = {};
    for (const [name, state] of this.#health) {
      const open = state.openUntil > Date.now();
      providers[name] = {
        configured: configured(name),
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
        latencyEwmaMs: state.latencyEwmaMs,
        openUntil: open ? state.openUntil : null,
        lastStatus: state.lastStatus,
        lastErrorClass: state.lastErrorClass,
        lastError: state.lastError,
      };
    }
    return { policy: config.routingPolicy, providers };
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
    state.lastErrorClass = rateLimited ? 'rate-limited' : permanent ? 'permanent' : error?.retryable ? 'transient' : 'unknown';
    state.latencyEwmaMs = state.latencyEwmaMs === null ? latencyMs : (state.latencyEwmaMs * 0.8) + (latencyMs * 0.2);
    state.halfOpen = false;
    if (rateLimited) {
      state.rateLimited += 1;
      state.consecutiveFailures += 1;
      state.openUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      logEvent('provider.rate_limited', { provider: name, status: error?.status || 429, cooldownMs: RATE_LIMIT_COOLDOWN_MS });
      logEvent('provider.breaker.open', { provider: name, reason: 'rate-limit', openUntil: state.openUntil });
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

  #getCache(key) {
    const item = this.#cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp >= CACHE_TTL_MS) { this.#cache.delete(key); return null; }
    return { text: item.text, provider: item.provider, model: item.model, latencyMs: item.latencyMs };
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
    const data = await fetchJson(config.primaryEndpoint, { method: 'POST', headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.openaiModel, input: request.input, store: false }) }, 'primary');
    const text = extractResponseText(data);
    if (!text) throw new AIProviderError('Primary provider returned an empty response', { provider: 'primary', retryable: true });
    return { text, model: config.openaiModel };
  }

  async #anthropic(request) {
    const p = providerConfig('anthropic');
    const messages = [...memoryMessages(request.memory), ...toAnthropicMessages(request.input)];
    const body = { model: p.model, max_tokens: Number(process.env.AI_ANTHROPIC_MAX_TOKENS || 2048), messages };
    const data = await fetchJson(p.endpoint, { method: 'POST', headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) }, 'anthropic');
    const text = extractAnthropicText(data);
    if (!text) throw new AIProviderError('Anthropic returned an empty response', { provider: 'anthropic', retryable: true });
    return { text, model: p.model };
  }

  async #genericChat(name, request) {
    const p = providerConfig(name);
    const messages = [...memoryMessages(request.memory), ...toChatContent(request.input, Boolean(p?.supportsVision))];
    const headers = { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' };
    const data = await fetchJson(p.endpoint, { method: 'POST', headers, body: JSON.stringify({ model: p.model, messages, temperature: request.temperature ?? 0.2 }) }, name);
    const text = extractResponseText(data);
    if (!text) throw new AIProviderError(`${name} returned an empty response`, { provider: name, retryable: true });
    return { text, model: p.model };
  }
}
