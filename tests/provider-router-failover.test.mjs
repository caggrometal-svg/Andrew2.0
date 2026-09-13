import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_MODEL = 'router-test-primary';
process.env.AI_PRIMARY_ENDPOINT = 'https://primary.test/v1/responses';
process.env.AI_SECONDARY_API_KEY = 'test';
process.env.AI_SECONDARY_ENDPOINT = 'https://secondary.test/v1/chat/completions';
process.env.AI_SECONDARY_MODEL = 'router-test-secondary';
process.env.AI_ROUTING_POLICY = 'primary';
for (const prefix of ['AI_GEMINI', 'AI_ANTHROPIC', 'AI_GROQ', 'AI_DEEPSEEK']) {
  process.env[`${prefix}_API_KEY`] = '';
  process.env[`${prefix}_ENDPOINT`] = '';
  process.env[`${prefix}_MODEL`] = '';
}

const { AIServiceUnavailableError, ProviderRouter } = await import('../server/ai/provider-router.mjs');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

function request(prompt, memory = ['shared-memory']) {
  return { prompt, input: [{ role: 'user', content: prompt }], history: [{ role: 'user', content: 'previous-history' }], memory, temperature: 0.2 };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env.AI_ROUTING_POLICY = 'primary';
});

describe('ProviderRouter failover hardening', () => {
  it('fails over immediately on primary 429 without retrying the same provider', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      if (url === process.env.AI_PRIMARY_ENDPOINT) return response(429, { error: { message: 'rate limit RPD' } });
      return response(200, { choices: [{ message: { content: 'secondary response' } }] });
    }));
    const router = new ProviderRouter();
    const result = await router.execute(request('failover-429'));
    expect(result.provider).toBe('secondary');
    expect(calls).toEqual([process.env.AI_PRIMARY_ENDPOINT, process.env.AI_SECONDARY_ENDPOINT]);
    expect(calls.filter(url => url === process.env.AI_PRIMARY_ENDPOINT)).toHaveLength(1);
    expect(router.getHealth().providers.primary.state).toBe('open');
  });

  it('preserves memory and history across provider switch', async () => {
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      bodies.push({ url, body: JSON.parse(options.body) });
      if (url === process.env.AI_PRIMARY_ENDPOINT) return response(429, { error: { message: 'RPD limit' } });
      return response(200, { choices: [{ message: { content: 'memory preserved' } }] });
    }));
    const router = new ProviderRouter();
    const result = await router.execute(request('memory-switch'));
    expect(result.provider).toBe('secondary');
    expect(JSON.stringify(bodies[1].body)).toContain('shared-memory');
    expect(JSON.stringify(bodies[1].body)).toContain('previous-history');
  });

  it('recovers a rate-limited provider through half-open and closes it after success', async () => {
    const now = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const calls = [];
    let healthy = false;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      if (url === process.env.AI_PRIMARY_ENDPOINT && !healthy) return response(429, { error: { message: 'requests per day exhausted' } });
      if (url === process.env.AI_PRIMARY_ENDPOINT && healthy) return response(200, { output_text: 'recovered' });
      return response(200, { choices: [{ message: { content: 'fallback' } }] });
    }));
    const router = new ProviderRouter();
    await router.execute(request('cooldown-first'));
    expect(router.getHealth().providers.primary.state).toBe('open');
    healthy = true;
    nowSpy.mockReturnValue(now + (5 * 60_000) + 1);
    const result = await router.execute(request('cooldown-recovery'));
    expect(result.provider).toBe('primary');
    expect(router.getHealth().providers.primary.state).toBe('closed');
    expect(calls.filter(url => url === process.env.AI_PRIMARY_ENDPOINT)).toHaveLength(2);
    nowSpy.mockRestore();
  });

  it('returns AI_SERVICE_UNAVAILABLE only after configured providers are exhausted', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      if (url === process.env.AI_PRIMARY_ENDPOINT) return response(429, { error: { message: 'RPD exhausted' } });
      return response(500, { error: { message: 'secondary unavailable' } });
    }));
    const router = new ProviderRouter();
    await expect(router.execute(request('all-exhausted'))).rejects.toMatchObject({ code: 'AI_SERVICE_UNAVAILABLE', status: 503, message: 'Servicio no disponible temporalmente' });
    expect(calls).toEqual([process.env.AI_PRIMARY_ENDPOINT, process.env.AI_SECONDARY_ENDPOINT, process.env.AI_SECONDARY_ENDPOINT]);
    expect(new AIServiceUnavailableError()).toMatchObject({ code: 'AI_SERVICE_UNAVAILABLE' });
  });
});
