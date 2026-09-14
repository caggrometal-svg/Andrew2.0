import { config } from '../config.mjs';

const DEFAULT_WEIGHTS = Object.freeze({ openai: 1, secondary: 1, anthropic: 1, gemini: 1, deepseek: 1, groq: 1 });
const state = { revision: 0, parameters: new Map(), weights: new Map(Object.entries(DEFAULT_WEIGHTS)), health: new Map() };

function parameter(key, value) {
  if (key === 'model') {
    if (typeof value !== 'string' || !value.trim() || value.length > 256 || /^sk[-_]/i.test(value.trim())) throw new TypeError('invalid model');
    return value.trim();
  }
  if (key === 'timeoutMs' || key === 'pollIntervalMs') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 300000) throw new TypeError(`invalid ${key}`);
    return Math.trunc(value);
  }
  if (key === 'syncEnabled') {
    if (typeof value !== 'boolean') throw new TypeError('invalid syncEnabled');
    return value;
  }
  if (key.startsWith('providerWeight.')) {
    const provider = key.slice('providerWeight.'.length);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(provider) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new TypeError('invalid provider weight');
    state.weights.set(provider, value);
    return value;
  }
  throw new TypeError('unsupported runtime parameter');
}

function configuredProviders() {
  const entries = [
    ['openai', { apiKey: config.openaiApiKey, endpoint: config.primaryEndpoint, model: config.openaiModel, protocol: 'responses', supportsVision: true }],
    ['secondary', { apiKey: config.secondaryApiKey, endpoint: config.secondaryEndpoint, model: config.secondaryModel, protocol: config.secondaryProtocol, supportsVision: config.secondarySupportsVision }],
    ...Object.entries(config.providers || {}),
  ];
  return entries.filter(([, p]) => p?.apiKey && p?.endpoint && p?.model);
}

function retryable(status) { return status === 408 || status === 409 || status === 429 || status >= 500; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalizeInput(input, prompt) { return Array.isArray(input) && input.length ? input : [{ role: 'user', content: prompt }]; }
function memoryText(memory) { return Array.isArray(memory) && memory.length ? `Memoria compartida de Andrew:\n${memory.filter((v) => typeof v === 'string').slice(0, 20).join('\n')}` : ''; }

function messagesFor({ input, prompt, memory }) {
  const messages = [];
  const memoryBlock = memoryText(memory);
  if (memoryBlock) messages.push({ role: 'system', content: memoryBlock });
  for (const item of normalizeInput(input, prompt).slice(-40)) {
    if (!item || !['user', 'assistant', 'system'].includes(item.role)) continue;
    const content = typeof item.content === 'string' ? [{ type: 'text', text: item.content.slice(0, 12000) }] : item.content;
    messages.push({ role: item.role, content });
  }
  return messages;
}

function extractChat(data) {
  const value = data?.choices?.[0]?.message?.content;
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((x) => x?.text).filter(Boolean).join('\n').trim();
  return '';
}
function extractResponses(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  return (data?.output || []).flatMap((item) => item?.content || []).map((x) => x?.text).filter(Boolean).join('\n').trim();
}
function extractGemini(data) { return data?.candidates?.flatMap((c) => c?.content?.parts || []).map((p) => p?.text).filter(Boolean).join('\n').trim() || ''; }

function buildBody(provider, args) {
  const messages = messagesFor(args);
  if (provider.protocol === 'responses') return { model: provider.model, input: messages.map((m) => ({ role: m.role, content: m.content })), store: false };
  if (provider.protocol === 'gemini') {
    const system = messages.find((m) => m.role === 'system');
    return { contents: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: (Array.isArray(m.content) ? m.content : [{ text: String(m.content) }]).map((p) => ({ text: p.text || '' })) })), ...(system ? { systemInstruction: { parts: [{ text: String(system.content) }] } } : {}) };
  }
  if (provider.protocol === 'messages') return { model: provider.model, max_tokens: 4096, ...(messages.find((m) => m.role === 'system') ? { system: String(messages.find((m) => m.role === 'system').content) } : {}), messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })) };
  return { model: provider.model, messages };
}

function request(provider, args) {
  const headers = { 'Content-Type': 'application/json' };
  let url = provider.endpoint;
  if (provider.protocol === 'gemini') url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(provider.apiKey)}`;
  else headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.protocol === 'messages') { delete headers.Authorization; headers['x-api-key'] = provider.apiKey; headers['anthropic-version'] = '2023-06-01'; }
  return { url, headers, body: buildBody(provider, args) };
}

async function callProvider(name, provider, args) {
  const { url, headers, body } = request(provider, args);
  let lastError;
  for (let attempt = 1; attempt <= Math.max(1, config.maxAttempts); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = Object.assign(new Error(data?.error?.message || data?.error?.status || `${name} HTTP ${response.status}`), { status: response.status });
        lastError = error;
        if (!retryable(response.status) || attempt === config.maxAttempts) throw error;
      } else {
        const text = provider.protocol === 'responses' ? extractResponses(data) : provider.protocol === 'gemini' ? extractGemini(data) : extractChat(data) || data?.content?.map?.((x) => x?.text).filter(Boolean).join('\n').trim();
        if (!text) throw new Error(`${name} returned an empty response`);
        state.health.set(name, { ok: true, latencyMs: Date.now() - started, at: new Date().toISOString(), model: data?.model || provider.model });
        return { text, provider: name, model: data?.model || provider.model, responseId: data?.id || null };
      }
    } catch (error) {
      lastError = error;
      state.health.set(name, { ok: false, latencyMs: Date.now() - started, at: new Date().toISOString(), error: error?.message || String(error), status: error?.status || null });
      if (attempt === config.maxAttempts || (error?.status && !retryable(error.status))) throw error;
    } finally { clearTimeout(timer); }
    await sleep(300 * 2 ** (attempt - 1));
  }
  throw lastError || new Error(`${name} request failed`);
}

export class ProviderRouter {
  async execute(args = {}) {
    const providers = configuredProviders();
    if (!providers.length) throw new Error('No hay proveedores de IA configurados o disponibles.');
    const ordered = providers.sort((a, b) => (state.weights.get(b[0]) ?? 1) - (state.weights.get(a[0]) ?? 1));
    const failures = [];
    for (const [name, provider] of ordered) {
      try { return await callProvider(name, provider, args); } catch (error) { failures.push({ provider: name, error: error?.message || String(error) }); }
    }
    const error = new Error('Todos los proveedores de IA fallaron.');
    error.failures = failures;
    throw error;
  }

  getHealth() {
    const configured = Object.fromEntries(configuredProviders().map(([name, p]) => [name, { configured: true, protocol: p.protocol, model: p.model, supportsVision: Boolean(p.supportsVision), ...(state.health.get(name) || { ok: null }) }]));
    return { ok: Object.values(configured).some((p) => p.ok === true), policy: config.routingPolicy, providers: configured, runtime: getRuntimeState() };
  }

  getRuntimeState() { return getRuntimeState(); }
}

export function updateRuntimeParameter({ key, value }) {
  const normalized = parameter(key, value);
  if (!key.startsWith('providerWeight.')) state.parameters.set(key, normalized);
  state.revision += 1;
  return { key, value: normalized, revision: state.revision, weights: Object.fromEntries(state.weights) };
}
export function getRuntimeState() { return { revision: state.revision, parameters: Object.fromEntries(state.parameters), weights: Object.fromEntries(state.weights) }; }
export function applyBridgeRuntimeCommand(command) {
  if (!command || command.command !== 'set_runtime_parameter') return null;
  const payload = command.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('invalid runtime command payload');
  return updateRuntimeParameter({ key: payload.key, value: payload.value });
}
