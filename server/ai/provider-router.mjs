import crypto from 'node:crypto';
import { config } from '../config.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;
const MAX_PROVIDER_ATTEMPTS = 3;
const RETRY_BASE_MS = 900;

export class AIProviderError extends Error {
  constructor(message, { provider, status = null, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'AIProviderError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function retryableStatus(status) { return status === 408 || status === 409 || status === 429 || status >= 500; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function hasMedia(request) { return Boolean(request.attachment?.type); }
function policyOrder(request) {
  const secondaryAvailable = Boolean(config.secondaryApiKey && config.secondaryEndpoint);
  if (!secondaryAvailable) return ['primary'];
  if (hasMedia(request) && !config.secondarySupportsVision) return ['primary'];
  if (config.routingPolicy === 'primary') return ['primary', 'secondary'];
  if (config.routingPolicy === 'secondary') return ['secondary', 'primary'];
  return hasMedia(request) ? ['primary', 'secondary'] : ['secondary', 'primary'];
}

async function fetchJson(url, options, provider, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const error = new AIProviderError(data?.error?.message || `${provider} HTTP ${response.status}`, { provider, status: response.status, retryable: retryableStatus(response.status) });
      if (!error.retryable || attempt === MAX_PROVIDER_ATTEMPTS) throw error;
      lastError = error;
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : RETRY_BASE_MS * (2 ** (attempt - 1)));
    } catch (error) {
      lastError = error;
      if (error instanceof AIProviderError && (!error.retryable || attempt === MAX_PROVIDER_ATTEMPTS)) throw error;
      if (attempt === MAX_PROVIDER_ATTEMPTS) throw error;
      await sleep(RETRY_BASE_MS * (2 ** (attempt - 1)));
    } finally { clearTimeout(timer); }
  }
  throw lastError || new AIProviderError(`${provider} request failed`, { provider, retryable: true });
}

export class ProviderRouter {
  #cache = new Map();

  async execute(request) {
    const key = hash({ prompt: request.prompt, history: request.history || [], input: request.input || [], memory: request.memory || [], temperature: request.temperature ?? null, attachment: request.attachment || null });
    const cached = this.#getCache(key);
    if (cached) return { ...cached, provider: 'cache', latencyMs: 0 };

    const started = Date.now();
    const failures = [];
    const executions = {
      primary: () => this.#primary(request),
      secondary: () => this.#secondary(request),
    };

    for (const name of policyOrder(request)) {
      try {
        const result = await executions[name]();
        const output = { text: result.text, provider: name, model: result.model, latencyMs: Date.now() - started };
        this.#setCache(key, output);
        return output;
      } catch (error) {
        failures.push(error);
      }
    }

    return { text: this.#local(request.prompt, failures), provider: 'local-degraded', model: null, latencyMs: Date.now() - started };
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

  async #primary(request) {
    const data = await fetchJson(config.primaryEndpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.openaiModel, input: request.input, store: false }),
    }, 'primary');
    const text = extractResponseText(data);
    if (!text) throw new AIProviderError('Primary provider returned an empty response', { provider: 'primary', retryable: true });
    return { text, model: config.openaiModel };
  }

  async #secondary(request) {
    const messages = [...(request.history || []).map(item => ({ role: item.role, content: item.content })), { role: 'user', content: request.prompt }];
    const data = await fetchJson(config.secondaryEndpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${config.secondaryApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.secondaryModel, messages, temperature: request.temperature ?? 0.2 }),
    }, 'secondary');
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new AIProviderError('Secondary provider returned an empty response', { provider: 'secondary', retryable: true });
    return { text, model: config.secondaryModel };
  }

  #local(prompt, failures) {
    const last = failures.at(-1);
    const reason = last?.status === 429 ? 'límite temporal del proveedor' : last?.status === 402 ? 'cuota o saldo del proveedor' : 'fallo del proveedor externo';
    return `Andrew continúa en modo degradado local. La consulta no se perdió. Motivo: ${reason}. Este modo no se presenta como una IA generativa equivalente. Consulta: ${prompt.slice(0, 160)}`;
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  return (data?.output || []).flatMap(item => item?.content || []).filter(content => content?.type === 'output_text' && typeof content.text === 'string').map(content => content.text).join('\n').trim();
}
