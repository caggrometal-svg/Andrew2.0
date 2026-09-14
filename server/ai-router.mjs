const DEFAULT_TIMEOUT_MS = 30000;
const COOLDOWN_MS = 60000;
const MAX_MEMORY = 20;
const DEFAULT_PROVIDER_ORDER = 'openai,openrouter,gemini,anthropic,deepseek,groq';

const cooldownUntil = new Map();

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
    groq: env('GROQ_API_KEY'),
  }[name]);
}

function markFailure(provider) {
  cooldownUntil.set(provider, Date.now() + COOLDOWN_MS);
}

function markSuccess(provider) {
  cooldownUntil.delete(provider);
}

function isCooling(provider) {
  const until = cooldownUntil.get(provider) || 0;
  if (until && until <= Date.now()) cooldownUntil.delete(provider);
  return until > Date.now();
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
    method: 'POST',
    headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input, store: false }),
    signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response);
  const reply = openAiText(data);
  if (!reply) throw new Error('empty_response');
  return { reply, model, responseId: typeof data.id === 'string' ? data.id : null };
}

async function callOpenRouter(input) {
  const models = csv('OPENROUTER_MODELS', 'anthropic/claude-sonnet-4.5,google/gemini-2.5-flash,openai/gpt-5.4-mini');
  const model = models[0];
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env('OPENROUTER_SITE_URL') || 'https://andrew2-api.onrender.com',
      'X-Title': 'Andrew 2.0',
    },
    body: JSON.stringify({ model, models, messages: [{ role: 'user', content: input }], provider: { allow_fallbacks: true } }),
    signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response);
  const reply = chatText(data);
  if (!reply) throw new Error('empty_response');
  return { reply, model: data.model || model, responseId: null };
}

async function callAnthropic(input) {
  const model = env('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: input }] }),
    signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response);
  const reply = Array.isArray(data.content) ? data.content.filter(x => x?.type === 'text').map(x => x.text).join('\n').trim() : '';
  if (!reply) throw new Error('empty_response');
  return { reply, model: data.model || model, responseId: data.id || null };
}

async function callGemini(input) {
  const model = env('GEMINI_MODEL') || 'gemini-2.5-flash';
  const key = env('GEMINI_API_KEY') || env('GOOGLE_API_KEY');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input }] }] }),
    signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response);
  const reply = data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('').trim() || '';
  if (!reply) throw new Error('empty_response');
  return { reply, model, responseId: null };
}

async function callOpenAiCompatible(input, { keyName, modelName, defaultModel, baseUrl }) {
  const model = env(modelName) || defaultModel;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env(keyName)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: input }] }),
    signal: timeoutSignal(Number(env('AI_PROVIDER_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS)),
  });
  const data = await readResponse(response);
  const reply = chatText(data);
  if (!reply) throw new Error('empty_response');
  return { reply, model: data.model || model, responseId: data.id || null };
}

async function callDeepSeek(input) {
  return callOpenAiCompatible(input, {
    keyName: 'DEEPSEEK_API_KEY',
    modelName: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  });
}

async function callGroq(input) {
  return callOpenAiCompatible(input, {
    keyName: 'GROQ_API_KEY',
    modelName: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  });
}

const CALLERS = {
  openai: callOpenAI,
  openrouter: callOpenRouter,
  anthropic: callAnthropic,
  gemini: callGemini,
  deepseek: callDeepSeek,
  groq: callGroq,
};

function configuredProviders() {
  const preferred = csv('AI_PROVIDER_ORDER', DEFAULT_PROVIDER_ORDER);
  const ordered = preferred.filter(provider => CALLERS[provider]);
  const fallback = Object.keys(CALLERS).filter(provider => !ordered.includes(provider));
  const candidates = [...ordered, ...fallback];
  return candidates.filter(provider => providerAvailable(provider) && !isCooling(provider));
}

export function getAiRouterStatus() {
  const providers = Object.keys(CALLERS).map(provider => ({
    provider,
    configured: providerAvailable(provider),
    coolingDown: isCooling(provider),
  }));
  const configured = providers.filter(p => p.configured && !p.coolingDown).map(p => p.provider);
  return {
    policy: env('ANDREW_ROUTING_POLICY') || 'multi-provider-failover',
    order: csv('AI_PROVIDER_ORDER', DEFAULT_PROVIDER_ORDER),
    configuredProviders: configured,
    providers,
  };
}

export async function routeAiChat({ message, memory }) {
  const input = buildInput(message, memory);
  const providers = configuredProviders();
  if (!providers.length) {
    return { ok: false, error: 'AI_PROVIDERS_UNAVAILABLE', message: 'No hay proveedores de IA configurados o disponibles.', failures: [] };
  }

  const failures = [];
  for (const provider of providers) {
    try {
      const result = await CALLERS[provider](input);
      markSuccess(provider);
      return { ok: true, provider, ...result, attempts: failures.length + 1 };
    } catch (error) {
      markFailure(provider);
      failures.push({ provider, status: error?.status || null, reason: error?.message || 'provider_failed' });
    }
  }

  return { ok: false, error: 'AI_ALL_PROVIDERS_FAILED', message: 'Los proveedores externos de IA no están disponibles temporalmente.', failures };
}
