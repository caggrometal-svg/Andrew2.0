import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiRouterStatus, routeAiChat } from './ai-router.mjs';

function snapshotEnv(names) { return Object.fromEntries(names.map(name => [name, process.env[name]])); }
function restoreEnv(snapshot) { for (const [name, value] of Object.entries(snapshot)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }

for (const name of ['OPENAI_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','XAI_API_KEY','AI_PROVIDER_ORDER','OPENROUTER_MODELS']) delete process.env[name];

test('routes to OpenRouter when OpenAI is rate-limited', async () => {
  const names = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'AI_PROVIDER_ORDER', 'OPENROUTER_MODELS']; const snapshot = snapshotEnv(names);
  process.env.OPENAI_API_KEY = 'test-openai'; process.env.OPENROUTER_API_KEY = 'test-openrouter'; process.env.AI_PROVIDER_ORDER = 'openai,openrouter'; process.env.OPENROUTER_MODELS = 'openai/gpt-5.4-mini';
  const originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); if (String(url).includes('api.openai.com')) return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'content-type': 'application/json' } }); return new Response(JSON.stringify({ model: 'openai/gpt-5.4-mini', choices: [{ message: { content: 'respuesta de respaldo' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try { const result = await routeAiChat({ message: 'Hola', memory: [] }); assert.equal(result.ok, true); assert.equal(result.provider, 'openrouter'); assert.equal(result.reply, 'respuesta de respaldo'); assert.equal(result.attempts, 2); assert.equal(calls.length, 2); const status = getAiRouterStatus(); assert.equal(status.providers.find(p => p.provider === 'openai').state, 'COOLDOWN'); assert.equal(status.providers.find(p => p.provider === 'openai').lastHttpStatus, 429); } finally { globalThis.fetch = originalFetch; restoreEnv(snapshot); }
});

test('builds a truthful six-provider pool without exposing keys', () => {
  const names = ['OPENAI_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','XAI_API_KEY','AI_PROVIDER_ORDER']; const snapshot = snapshotEnv(names);
  try { process.env.OPENAI_API_KEY='test-openai'; process.env.OPENROUTER_API_KEY='test-openrouter'; process.env.GEMINI_API_KEY='test-gemini'; process.env.ANTHROPIC_API_KEY='test-anthropic'; process.env.DEEPSEEK_API_KEY='test-deepseek'; process.env.XAI_API_KEY='test-xai'; process.env.AI_PROVIDER_ORDER='bogus,openai,gemini'; const status=getAiRouterStatus(); assert.deepEqual(status.configuredProviders, ['openai','openrouter','gemini','anthropic','deepseek','xai']); assert.equal(status.providers.length,6); assert.equal(JSON.stringify(status).includes('test-openai'),false); assert.equal(status.providers.every(p => ['NOT_CONFIGURED','READY','COOLDOWN','FAILED'].includes(p.state)),true); } finally { restoreEnv(snapshot); }
});

test('fails over through all six providers and succeeds at the final provider', async () => {
  const names = ['OPENAI_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','XAI_API_KEY','AI_PROVIDER_ORDER','OPENROUTER_MODELS'];
  const snapshot = snapshotEnv(names);
  const originalFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY='test-openai'; process.env.OPENROUTER_API_KEY='test-openrouter'; process.env.GEMINI_API_KEY='test-gemini'; process.env.ANTHROPIC_API_KEY='test-anthropic'; process.env.DEEPSEEK_API_KEY='test-deepseek'; process.env.XAI_API_KEY='test-xai';
    process.env.AI_PROVIDER_ORDER='openai,openrouter,gemini,anthropic,deepseek,xai'; process.env.OPENROUTER_MODELS='test/model';
    const calls = [];
    globalThis.fetch = async (url) => {
      const target = String(url); calls.push(target);
      if (target.includes('api.x.ai')) return new Response(JSON.stringify({ model: 'grok-test', choices: [{ message: { content: 'xAI final fallback' } }] }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: 'forced failover' } }), { status: 503 });
    };
    const result = await routeAiChat({ message: 'failover', memory: [] });
    assert.equal(result.ok, true); assert.equal(result.provider, 'xai'); assert.equal(result.attempts, 6); assert.equal(calls.length, 6);
    const status = getAiRouterStatus();
    for (const provider of ['openai','openrouter','gemini','anthropic','deepseek']) assert.equal(status.providers.find(p => p.provider === provider)?.state, 'COOLDOWN');
    assert.equal(status.providers.find(p => p.provider === 'xai')?.state, 'READY');
  } finally { globalThis.fetch = originalFetch; restoreEnv(snapshot); }
});

test('reports no-provider state explicitly without throwing', () => {
  const names = ['OPENAI_API_KEY','OPENROUTER_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','XAI_API_KEY','AI_PROVIDER_ORDER']; const snapshot=snapshotEnv(names);
  try { for (const name of names) delete process.env[name]; process.env.AI_PROVIDER_ORDER='bogus'; const status=getAiRouterStatus(); assert.deepEqual(status.configuredProviders, []); assert.equal(status.availableProviders.length,0); assert.equal(status.providers.every(p => p.state==='NOT_CONFIGURED'),true); } finally { restoreEnv(snapshot); }
});
