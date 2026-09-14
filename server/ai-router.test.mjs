import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiRouterStatus, routeAiChat } from './ai-router.mjs';

test('routes to OpenRouter when OpenAI is rate-limited', async () => {
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports configured providers without exposing credentials', () => {
  const status = getAiRouterStatus();
  assert.ok(Array.isArray(status.providers));
  assert.equal(JSON.stringify(status).includes('test-openai'), false);
  assert.equal(JSON.stringify(status).includes('test-openrouter'), false);
});
