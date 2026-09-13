import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConfig = {
  openaiApiKey: 'primary-key',
  openaiModel: 'primary-model',
  primaryEndpoint: 'https://primary.test/v1/responses',
  secondaryApiKey: 'secondary-key',
  secondaryEndpoint: 'https://secondary.test/v1/chat/completions',
  secondaryModel: 'secondary-model',
  secondarySupportsVision: false,
  providers: {},
  routingPolicy: 'primary',
};

vi.mock('../server/config.mjs', () => ({ config: mockConfig }));

const { AIServiceUnavailableError, ProviderRouter } = await import('../server/ai/provider-router.mjs');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function request(prompt, memory = ['Camilo prefiere respuestas directas']) {
  return {
    prompt,
    input: [{ role: 'user', content: prompt }],
    history: [{ role: 'user', content: 'historial previo' }],
    memory,
    temperature: 0.2,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockConfig.routingPolicy = 'primary';
});

describe('ProviderRouter failover hardening', () => {
  it('fails over immediately on primary 429 without retrying the same provider', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      if (url === mockConfig.primaryEndpoint) return response(429, { error: { message: 'Rate limit reached: RPD exhausted' } });
      return response(200, { choices: [{ message: { content: 'respuesta secundaria' } }] });
    }));

    const router = new ProviderRouter();
    const result = await router.execute(request('prueba de failover 429'));

    expect(result.provider).toBe('secondary');
    expect(result.text).toBe('respuesta secundaria');
    expect(calls).toEqual([mockConfig.primaryEndpoint, mockConfig.secondaryEndpoint]);
    expect(calls.filter(url => url === mockConfig.primaryEndpoint)).toHaveLength(1);
    expect(router.getHealth().providers.primary.state).toBe('open');
    expect(router.getHealth().providers.primary.lastStatus).toBe(429);
  });

  it('preserves shared memory while switching providers', async () => {
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      bodies.push({ url, body: JSON.parse(options.body) });
      if (url === mockConfig.primaryEndpoint) return response(429, { error: { message: 'RPD limit' } });
      return response(200, { choices: [{ message: { content: 'memoria preservada' } }] });
    }));

    const router = new ProviderRouter();
    const result = await router.execute(request('recuerda el contexto'));

    expect(result.provider).toBe('secondary');
    expect(JSON.stringify(bodies[1].body)).toContain('Camilo prefiere respuestas directas');
    expect(JSON.stringify(bodies[1].body)).toContain('historial previo');
    expect(JSON.stringify(bodies[1].body)).toContain('recuerda el contexto');
  });

  it('recovers an opened rate-limited provider through half-open and closes it after success', async () => {
    const now = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const calls = [];
    let primaryHealthy = false;

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      if (url === mockConfig.primaryEndpoint && !primaryHealthy) return response(429, { error: { message: 'requests per day exhausted' } });
      if (url === mockConfig.primaryEndpoint && primaryHealthy) return response(200, { output_text: 'primary recuperado' });
      return response(200, { choices: [{ message: { content: 'secondary fallback' } }] });
    }));

    const router = new ProviderRouter();
    await router.execute(request('primera solicitud'));
    expect(router.getHealth().providers.primary.state).toBe('open');

    primaryHealthy = true;
    nowSpy.mockReturnValue(now + (5 * 60_000) + 1);
    const recovered = await router.execute(request('segunda solicitud tras cooldown'));

    expect(recovered.provider).toBe('primary');
    expect(router.getHealth().providers.primary.state).toBe('closed');
    expect(calls.filter(url => url === mockConfig.primaryEndpoint)).toHaveLength(2);
    nowSpy.mockRestore();
  });

  it('returns AI_SERVICE_UNAVAILABLE only after all configured providers are exhausted', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(url);
      if (url === mockConfig.primaryEndpoint) return response(429, { error: { message: 'RPD exhausted' } });
      return response(500, { error: { message: 'secondary unavailable' } });
    }));

    const router = new ProviderRouter();

    await expect(router.execute(request('todos los proveedores fallan'))).rejects.toMatchObject({
      code: 'AI_SERVICE_UNAVAILABLE',
      status: 503,
      message: 'Servicio no disponible temporalmente',
    });

    expect(calls).toEqual([
      mockConfig.primaryEndpoint,
      mockConfig.secondaryEndpoint,
      mockConfig.secondaryEndpoint,
    ]);
    expect(router).toBeInstanceOf(ProviderRouter);
    expect(new AIServiceUnavailableError()).toMatchObject({ code: 'AI_SERVICE_UNAVAILABLE' });
  });
});
