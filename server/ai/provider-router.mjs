import crypto from 'node:crypto';
import { config } from '../config.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;
const MAX_PROVIDER_ATTEMPTS = 3;
const RETRY_BASE_MS = 900;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;
const HEALTH_LATENCY_TARGET_MS = 4_000;

export class AIProviderError extends Error {
  constructor(message, { provider, status = null, retryable = false, cause } = {}) { super(message, { cause }); this.name = 'AIProviderError'; this.provider = provider; this.status = status; this.retryable = retryable; }
}

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function retryableStatus(status) { return status === 408 || status === 409 || status === 429 || status >= 500; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function hasMedia(request) { return Boolean(request.attachment?.type); }
function configured(name) { if (name === 'primary') return Boolean(config.openaiApiKey && config.primaryEndpoint && config.openaiModel); if (name === 'secondary') return Boolean(config.secondaryApiKey && config.secondaryEndpoint && config.secondaryModel); const p = config.providers?.[name]; return Boolean(p?.apiKey && p?.endpoint && p?.model); }
function providerConfig(name) { if (name === 'primary') return { apiKey: config.openaiApiKey, endpoint: config.primaryEndpoint, model: config.openaiModel, protocol: 'responses', supportsVision: true }; if (name === 'secondary') return { apiKey: config.secondaryApiKey, endpoint: config.secondaryEndpoint, model: config.secondaryModel, protocol: 'chat', supportsVision: config.secondarySupportsVision }; return config.providers[name]; }
function providerNames() { return ['primary', 'secondary', ...Object.keys(config.providers || {})]; }
function supportsMedia(name) { return Boolean(providerConfig(name)?.supportsVision); }
function policyOrder(request) {
  const candidates = providerNames().filter(configured).filter(name => !hasMedia(request) || supportsMedia(name));
  if (!candidates.length) return [];
  const policy = config.routingPolicy;
  if (policy === 'primary') return ['primary', ...candidates.filter(name => name !== 'primary')];
  if (policy === 'secondary') return ['secondary', ...candidates.filter(name => name !== 'secondary')];
  if (hasMedia(request)) return ['primary', ...candidates.filter(name => name !== 'primary')];
  return ['secondary', 'deepseek', 'groq', 'gemini', 'anthropic', 'primary'].filter((name, index, list) => candidates.includes(name) && list.indexOf(name) === index).concat(candidates.filter(name => !['secondary','deepseek','groq','gemini','anthropic','primary'].includes(name)));
}
function createHealthState() { return { successes: 0, failures: 0, consecutiveFailures: 0, lastFailureAt: null, lastSuccessAt: null, lastError: null, latencyEwmaMs: null, openUntil: 0, halfOpen: false, probeInFlight: false }; }

async function fetchJson(url, options, provider, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const error = new AIProviderError(data?.error?.message || `${provider} HTTP ${response.status}`, { provider, status: response.status, retryable: retryableStatus(response.status) });
      if (!error.retryable || attempt === MAX_PROVIDER_ATTEMPTS) throw error;
      lastError = error;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : RETRY_BASE_MS * (2 ** (attempt - 1));
      await sleep(delay + Math.floor(Math.random() * 250));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof AIProviderError && (!error.retryable || attempt === MAX_PROVIDER_ATTEMPTS)) throw error;
      if (attempt === MAX_PROVIDER_ATTEMPTS) throw lastError;
      await sleep(RETRY_BASE_MS * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
    } finally { clearTimeout(timer); }
  }
  throw lastError || new AIProviderError(`${provider} request failed`, { provider, retryable: true });
}

export class ProviderRouter {
  #cache = new Map();
  #health = new Map(providerNames().map(name => [name, createHealthState()]));

  async execute(request) {
    const key = hash({ prompt: request.prompt, history: request.history || [], input: request.input || [], memory: request.memory || [], temperature: request.temperature ?? null, attachment: request.attachment || null });
    const cached = this.#getCache(key); if (cached) return { ...cached, provider: 'cache', latencyMs: 0 };
    const started = Date.now(); const failures = [];
    const executions = Object.fromEntries(providerNames().map(name => [name, () => this.#executeProvider(name, request)]));
    for (const name of policyOrder(request)) {
      if (!this.#canAttempt(name)) continue;
      const health = this.#health.get(name); if (health?.halfOpen) health.probeInFlight = true;
      const providerStarted = Date.now();
      try {
        const result = await executions[name](); this.#recordSuccess(name, Date.now() - providerStarted);
        const output = { text: result.text, provider: name, model: result.model, latencyMs: Date.now() - started }; this.#setCache(key, output); return output;
      } catch (error) { this.#recordFailure(name, error, Date.now() - providerStarted); failures.push(error); }
      finally { const current = this.#health.get(name); if (current) current.probeInFlight = false; }
    }
    return { text: this.#local(request.prompt, failures), provider: 'local-degraded', model: null, latencyMs: Date.now() - started };
  }

  getHealth() {
    const providers = {};
    for (const [name, state] of this.#health) {
      const isConfigured = configured(name); const open = state.openUntil > Date.now();
      const score = !isConfigured ? 0 : open ? 20 : Math.max(0, Math.min(100, 100 - state.consecutiveFailures * 25 - (state.latencyEwmaMs ? Math.min(30, Math.round((state.latencyEwmaMs / HEALTH_LATENCY_TARGET_MS) * 30)) : 0)));
      providers[name] = { configured: isConfigured, state: open ? 'open' : state.halfOpen ? 'half-open' : 'closed', score, capabilities: { vision: supportsMedia(name) }, model: providerConfig(name)?.model || null, successes: state.successes, failures: state.failures, consecutiveFailures: state.consecutiveFailures, lastFailureAt: state.lastFailureAt, lastSuccessAt: state.lastSuccessAt, latencyEwmaMs: state.latencyEwmaMs, openUntil: open ? state.openUntil : null, lastError: state.lastError };
    }
    return { policy: config.routingPolicy, providers };
  }

  #canAttempt(name) {
    const state = this.#health.get(name); if (!state || !configured(name)) return false;
    if (state.openUntil > Date.now()) return false;
    if (state.openUntil && state.openUntil <= Date.now()) { if (state.probeInFlight) return false; state.halfOpen = true; }
    return !state.halfOpen || !state.probeInFlight;
  }
  #recordSuccess(name, latencyMs) { const state = this.#health.get(name); if (!state) return; state.successes += 1; state.consecutiveFailures = 0; state.lastSuccessAt = Date.now(); state.lastError = null; state.openUntil = 0; state.halfOpen = false; state.latencyEwmaMs = state.latencyEwmaMs === null ? latencyMs : (state.latencyEwmaMs * 0.8) + (latencyMs * 0.2); }
  #recordFailure(name, error, latencyMs) { const state = this.#health.get(name); if (!state) return; state.failures += 1; state.consecutiveFailures += 1; state.lastFailureAt = Date.now(); state.lastError = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256); state.latencyEwmaMs = state.latencyEwmaMs === null ? latencyMs : (state.latencyEwmaMs * 0.8) + (latencyMs * 0.2); state.halfOpen = false; if (state.consecutiveFailures >= BREAKER_THRESHOLD) state.openUntil = Date.now() + BREAKER_COOLDOWN_MS; }
  #getCache(key) { const item = this.#cache.get(key); if (!item) return null; if (Date.now() - item.timestamp >= CACHE_TTL_MS) { this.#cache.delete(key); return null; } return { text: item.text, provider: item.provider, model: item.model, latencyMs: item.latencyMs }; }
  #setCache(key, result) { this.#cache.set(key, { ...result, timestamp: Date.now() }); while (this.#cache.size > MAX_CACHE_ENTRIES) this.#cache.delete(this.#cache.keys().next().value); }

  async #executeProvider(name, request) {
    if (name === 'primary') return this.#primary(request);
    if (name === 'secondary') return this.#secondary(request);
    return this.#genericChat(name, request);
  }
  async #primary(request) { const data = await fetchJson(config.primaryEndpoint, { method: 'POST', headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.openaiModel, input: request.input, store: false }) }, 'primary'); const text = extractResponseText(data); if (!text) throw new AIProviderError('Primary provider returned an empty response', { provider: 'primary', retryable: true }); return { text, model: config.openaiModel }; }
  async #secondary(request) { return this.#genericChat('secondary', request); }
  async #genericChat(name, request) {
    const p = providerConfig(name); const memory = request.memory?.length ? `\nContexto de memoria compartida:\n${request.memory.join('\n')}` : '';
    const messages = [...(request.history || []).map(item => ({ role: item.role, content: item.content })), { role: 'user', content: `${request.prompt}${memory}` }];
    const data = await fetchJson(p.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: p.model, messages, temperature: request.temperature ?? 0.2 }) }, name);
    const text = data?.choices?.[0]?.message?.content?.trim(); if (!text) throw new AIProviderError(`${name} returned an empty response`, { provider: name, retryable: true }); return { text, model: p.model };
  }
  #local(prompt, failures) { const last = failures.at(-1); const reason = last?.status === 429 ? 'límite temporal del proveedor' : last?.status === 402 ? 'cuota o saldo del proveedor' : 'fallo de los proveedores externos'; return `Andrew continúa en modo degradado local. La consulta no se perdió. Motivo: ${reason}. Este modo no se presenta como una IA generativa equivalente. Consulta: ${prompt.slice(0, 160)}`; }
}

export function createProviderRouter() { return new ProviderRouter(); }
function extractResponseText(data) { if (typeof data?.output_text === 'string') return data.output_text.trim(); return (data?.output || []).flatMap(item => item?.content || []).filter(content => content?.type === 'output_text' && typeof content.text === 'string').map(content => content.text).join('\n').trim(); }
