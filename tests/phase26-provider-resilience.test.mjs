import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockedConfig = vi.hoisted(() => ({
  openaiApiKey: 'primary-key',
  openaiModel: 'primary-model',
  primaryEndpoint: 'https://primary.test/v1/responses',
  secondaryApiKey: 'secondary-key',
  secondaryEndpoint: 'https://secondary.test/v1/chat/completions',
  secondaryModel: 'secondary-model',
  secondarySupportsVision: false,
  routingPolicy: 'balanced',
  providers: {},
  tiers: { primary: { tier: 1 }, secondary: { tier: 2 } },
}));

vi.mock('../server/config.mjs', () => ({ config: mockedConfig }));

import { ProviderRouter } from '../server/ai/provider-router.mjs';

const primaryOk = () => ({ ok: true, json: async () => ({ output_text: 'primary answer' }), headers: new Headers() });
const secondaryOk = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'secondary answer' } }] }), headers: new Headers() });

beforeEach(() => { mockedConfig.routingPolicy = 'balanced'; vi.restoreAllMocks(); });
afterEach(() => vi.useRealTimers());

describe('Phase 26 provider resilience', () => {
  it('routes text to secondary first under balanced policy and reports health', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(secondaryOk());
    const router = new ProviderRouter();
    const result = await router.execute({ prompt: 'hola', history: [], input: [{ role: 'user', content: 'hola' }], memory: [] });
    expect(result.provider).toBe('secondary');
    expect(router.getHealth().providers.secondary.score).toBeGreaterThan(0);
  });

  it('keeps media on primary when secondary lacks vision', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(primaryOk());
    const router = new ProviderRouter();
    const result = await router.execute({ prompt: 'analiza imagen', input: [{ role: 'user', content: 'analiza' }], attachment: { type: 'image', name: 'x.jpg' } });
    expect(result.provider).toBe('primary');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('opens primary after three transient provider failures and then falls back', async () => {
    mockedConfig.routingPolicy = 'primary';
    const primaryFailure = () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'down' } }), headers: new Headers() });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => Promise.resolve(String(url) === mockedConfig.primaryEndpoint ? primaryFailure() : secondaryOk()));
    const router = new ProviderRouter();

    const first = await router.execute({ prompt: 'one', input: [{ role: 'user', content: 'one' }] });
    expect(first.provider).toBe('secondary');
    expect(router.getHealth().providers.primary.state).toBe('closed');

    const second = await router.execute({ prompt: 'two', input: [{ role: 'user', content: 'two' }] });
    expect(second.provider).toBe('secondary');
    expect(router.getHealth().providers.primary.state).toBe('closed');

    const third = await router.execute({ prompt: 'three', input: [{ role: 'user', content: 'three' }] });
    expect(third.provider).toBe('secondary');
    expect(router.getHealth().providers.primary.state).toBe('open');

    const fourth = await router.execute({ prompt: 'four', input: [{ role: 'user', content: 'four' }] });
    expect(fourth.provider).toBe('secondary');
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('passes explicit memory into the secondary request contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(secondaryOk());
    const router = new ProviderRouter();
    await router.execute({ prompt: 'qué recuerdas', history: [], input: [{ role: 'user', content: 'El usuario prefiere respuestas directas.\n\nqué recuerdas' }], memory: ['El usuario prefiere respuestas directas.'] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages.at(-1).content).toContain('El usuario prefiere respuestas directas.');
  });
});
