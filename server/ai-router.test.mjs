import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiRouterStatus, routeAiChat } from './ai-router.mjs';

function snapshotEnv(names) {
  return Object.fromEntries(names.map(name => [name, process.env[name]]));
}

function restoreEnv(snapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test('routes to OpenRouter when OpenAI is rate-limited', async () => {
  const names = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'AI_PROVIDER_ORDER', 'OPENROUTER_MODELS'];
  const snapshot = snapshotEnv(names);
  process.env.OPENAI_API_KEY = 'test-openai';
  process.env.OPENROUTER_API_KEY = 'test-openrouter';
  process.env.AI_PROVIDER_ORDER = 'openai,openrouter';
  process.env.OPENROUTER_MODELS = 'openai/gpt-5.4-mini';

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('api.openai.com')) {
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ model: 'openai/gpt-5.4-mini', choices: [{ message: { content: 'respuesta de respaldo' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await routeAiChat({ message: 'Hola', memory: [] });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.reply, 'respuesta de respaldo');
    assert.equal(result.attempts, 2);
    assert.equal(calls.length, 2);
    assert.equal(result.failures, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test('ignores unsupported providers and builds a usable six-provider pool', () => {
  const names = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER_ORDER'];
  const snapshot = snapshotEnv(names);
  try {
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.OPENROUTER_API_KEY = 'test-openrouter';
    process.env.GEMINI_API_KEY = 'test-gemini';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek';
    process.env.GROQ_API_KEY = 'test-groq';
    process.env.AI_PROVIDER_ORDER = 'bogus,openai,gemini';

    const status = getAiRouterStatus();
    assert.deepEqual(status.configuredProviders, ['openai', 'gemini', 'openrouter', 'anthropic', 'deepseek', 'groq']);
    assert.equal(status.providers.length, 6);
    assert.equal(JSON.stringify(status).includes('test-openai'), false);
  } finally {
    restoreEnv(snapshot);
  }
});

test('reports no-provider state explicitly without throwing', () => {
  const names = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER_ORDER'];
  const snapshot = snapshotEnv(names);
  try {
    for (const name of names.slice(0, 7)) delete process.env[name];
    process.env.AI_PROVIDER_ORDER = 'bogus';
    const status = getAiRouterStatus();
    assert.deepEqual(status.configuredProviders, []);
  } finally {
    restoreEnv(snapshot);
  }
});
