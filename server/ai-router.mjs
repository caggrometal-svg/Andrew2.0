const DEFAULT_TIMEOUT_MS = 60000;
const COOLDOWN_MS = 60000;
const MAX_MEMORY = 20;
const DEFAULT_PROVIDER_ORDER = 'openai,openrouter,gemini,anthropic,deepseek,xai';

const cooldownUntil = new Map();
const telemetry = new Map();

function env(name) {
  return (process.env[name] || '').trim();
}

function csv(name, fallback) {
  const value = env(name);
  return (value || fallback).split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
}

function providerAvailable(name) {
  return Boolean({
    openai: env('OPENAI_API_KEY'),
    openrouter: env('OPENROUTER_API_KEY'),
    anthropic: env('ANTHROPIC_API_KEY'),
    gemini: env('GEMINI_API_KEY') || env('GOOGLE_API_KEY'),
    deepseek: env('DEEPSEEK_API_KEY'),
    xai: env('XAI_API_KEY'),
  }[name]);
}

function providerState(name) {
  return telemetry.get(name) || { lastError: null, lastHttpStatus: null, lastAttemptAt: null, lastSuccessAt: null, lastLatencyMs: null, attempts: 0, failures: 0 };
}

function markFailure(provider, error, latencyMs) {
  cooldownUntil.set(provider, Date.now() + COOLDOWN_MS);
  const current = providerState(provider);
  telemetry.set(provider, {
    ...current,
    lastError: typeof error?.message === 'string' ? error.message.slice(0, 256) : 'provider_failed',
    lastHttpStatus: Number.isInteger(error?.status) ? error.status : null,
    lastAttemptAt: new Date().toISOString(),
    lastLatencyMs: Math.max(0, Math.round(latencyMs)),
    attempts: current.attempts + 1,
    failures: current.failures + 1,
  });
}

function markSuccess(provider, latencyMs) {
  cooldownUntil.delete(provider);
  const current = providerState(provider);
  telemetry.set(provider, {
    ...current,
    lastError: null,
    lastHttpStatus: 200,
    lastAttemptAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastLatencyMs: Math.max(0, Math.round(latencyMs)),
    attempts: current.attempts + 1,
  });
}

function isCooling(provider) {
  const until = cooldownUntil.get(provider) || 0;
  if (until && until <= Date.now()) cooldownUntil.delete(provider);
  return until > Date.now();
}

function cooldownRemainingMs(provider) {
  const until = cooldownUntil.get(provider) || 0;
  return Math.max(0, until - Date.now());
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error?.status || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function openAiText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) for (const content of item.content || []) if (typeof content.text === 'string') parts.push(content.text);
  return parts.join('\n').trim();
}

function chatText(data) {
  return data?.choices?.[0]?.message?.content?.trim?.() || '';
}

function buildInput(message, memory) {
  const cleanMemory = Array.isArray(memory) ? memory.filter(v => typeof v === 'string').slice(0, MAX_MEMORY) : [];
  return cleanMemory.length
    ? `Memoria local relevante:\n${cleanMemory.join('\n')}\n\nMensaje del usuario:\n${message}`
    : message;
}

async function callOpenAI(input) {
  const model = env('OPENAI_MODEL') || 'gpt-5.6-luna';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, store: false }), signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response); const reply = openAiText(data);
  if (!reply) throw new Error('empty_response');
  return { reply, model, responseId: typeof data.id === 'string' ? data.id : null };
}

async function callOpenRouter(input) {
  const models = csv('OPENROUTER_MODELS', 'anthropic/claude-sonnet-4.5,google/gemini-2.5-flash,openai/gpt-5.4-mini');
  const model = models[0];
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`, 'Content-Type': 'application/json', 'HTTP-Referer': env('OPENROUTER_SITE_URL') || 'https://andrew2-api.onrender.com', 'X-Title': 'Andrew 2.0' },
    body: JSON.stringify({ model, models, messages: [{ role: 'user', content: input }], provider: { allow_fallbacks: true } }),
    signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response); const reply = chatText(data);
  if (!reply) throw new Error('empty_response');
  return { reply, model: data.model || model, responseId: null };
}

async function callAnthropic(input) {
  const model = env('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: input }] }), signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response); const reply = Array.isArray(data.content) ? data.content.filter(x => x?.type === 'text').map(x => x.text).join('\n').trim() : '';
  if (!reply) throw new Error('empty_response');
  return { reply, model: data.model || model, responseId: data.id || null };
}

async function callGemini(input) {
  const model = env('GEMINI_MODEL') || 'gemini-2.5-flash'; const key = env('GEMINI_API_KEY') || env('GOOGLE_API_KEY');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input }] }] }), signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response); const reply = data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('').trim() || '';
  if (!reply) throw new Error('empty_response');
  return { reply, model, responseId: null };
}

async function callOpenAiCompatible(input, { keyName, modelName, defaultModel, baseUrl }) {
  const model = env(modelName) || defaultModel;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${env(keyName)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: input }] }), signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response); const reply = chatText(data);
  if (!reply) throw new Error('empty_response');
  return { reply, model: data.model || model, responseId: data.id || null };
}

async function callDeepSeek(input) { return callOpenAiCompatible(input, { keyName: 'DEEPSEEK_API_KEY', modelName: 'DEEPSEEK_MODEL', defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' }); }
async function callXAI(input) { return callOpenAiCompatible(input, { keyName: 'XAI_API_KEY', modelName: 'XAI_MODEL', defaultModel: 'grok-4.1-fast', baseUrl: 'https://api.x.ai/v1' }); }

const CALLERS = { openai: callOpenAI, openrouter: callOpenRouter, gemini: callGemini, anthropic: callAnthropic, deepseek: callDeepSeek, xai: callXAI };

function configuredProviders() {
  const preferred = csv('AI_PROVIDER_ORDER', DEFAULT_PROVIDER_ORDER);
  const ordered = preferred.filter(provider => CALLERS[provider]);
  const fallback = Object.keys(CALLERS).filter(provider => !ordered.includes(provider));
  return [...ordered, ...fallback].filter(provider => providerAvailable(provider) && !isCooling(provider));
}

export function getAiRouterStatus() {
  const providers = Object.keys(CALLERS).map(provider => {
    const state = providerState(provider);
    const coolingDown = isCooling(provider);
    return {
      provider,
      state: !providerAvailable(provider) ? 'NOT_CONFIGURED' : coolingDown ? 'COOLDOWN' : state.lastError ? 'FAILED' : 'READY',
      configured: providerAvailable(provider),
      available: providerAvailable(provider) && !coolingDown,
      coolingDown,
      cooldownMs: cooldownRemainingMs(provider),
      lastError: state.lastError,
      lastHttpStatus: state.lastHttpStatus,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      lastLatencyMs: state.lastLatencyMs,
      attempts: state.attempts,
      failures: state.failures,
    };
  });
  return {
    policy: env('ANDREW_ROUTING_POLICY') || 'balanced',
    order: csv('AI_PROVIDER_ORDER', DEFAULT_PROVIDER_ORDER),
    configuredProviders: providers.filter(p => p.configured).map(p => p.provider),
    availableProviders: providers.filter(p => p.available).map(p => p.provider),
    providers,
    timeoutMs: Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS),
    cooldownMs: COOLDOWN_MS,
  };
}

export async function routeAiChat({ message, memory }) {
  const input = buildInput(message, memory); const providers = configuredProviders();
  if (!providers.length) return { ok: false, error: 'AI_PROVIDERS_UNAVAILABLE', message: 'No hay proveedores disponibles. Revisar /api/ai/status para distinguir configuración, cooldown y fallos.', failures: [] };
  const failures = [];
  for (const provider of providers) {
    const started = Date.now();
    try {
      const result = await CALLERS[provider](input); markSuccess(provider, Date.now() - started);
      return { ok: true, provider, ...result, attempts: failures.length + 1 };
    } catch (error) {
      markFailure(provider, error, Date.now() - started);
      failures.push({ provider, status: error?.status || null, reason: error?.message || 'provider_failed' });
    }
  }
  return { ok: false, error: 'AI_ALL_PROVIDERS_FAILED', message: 'Todos los proveedores disponibles fallaron; consultar el diagnóstico de cada proveedor.', failures };
}
