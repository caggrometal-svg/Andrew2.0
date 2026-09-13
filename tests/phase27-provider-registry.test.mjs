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
  tiers: { primary: { tier: 1 }, secondary: { tier: 1 } },
  providers: {
    anthropic: { apiKey: 'anthropic-key', endpoint: 'https://anthropic.test/v1/messages', model: 'claude-test', protocol: 'messages', supportsVision: true, tier: 2 },
    deepseek: { apiKey: 'deepseek-key', endpoint: 'https://deepseek.test/chat/completions', model: 'deepseek-test', protocol: 'chat', supportsVision: false, tier: 3 },
  },
}));

vi.mock('../server/config.mjs', () => ({ config: mockedConfig }));
import { ProviderRouter } from '../server/ai/provider-router.mjs';

function resetConfig() {
  mockedConfig.openaiApiKey = 'primary-key';
  mockedConfig.openaiModel = 'primary-model';
  mockedConfig.primaryEndpoint = 'https://primary.test/v1/responses';
  mockedConfig.secondaryApiKey = 'secondary-key';
  mockedConfig.secondaryEndpoint = 'https://secondary.test/v1/chat/completions';
  mockedConfig.secondaryModel = 'secondary-model';
  mockedConfig.secondarySupportsVision = false;
  mockedConfig.routingPolicy = 'balanced';
  mockedConfig.tiers = { primary: { tier: 1 }, secondary: { tier: 1 } };
  mockedConfig.providers.anthropic = { apiKey: 'anthropic-key', endpoint: 'https://anthropic.test/v1/messages', model: 'claude-test', protocol: 'messages', supportsVision: true, tier: 2 };
  mockedConfig.providers.deepseek = { apiKey: 'deepseek-key', endpoint: 'https://deepseek.test/chat/completions', model: 'deepseek-test', protocol: 'chat', supportsVision: false, tier: 3 };
}

beforeEach(() => { resetConfig(); vi.restoreAllMocks(); });
afterEach(() => vi.useRealTimers());
const ok = (json) => ({ ok: true, json: async () => json, headers: new Headers() });

describe('Phase 27 multi-provider registry', () => {
  it('discovers configured providers and exposes capabilities', () => {
    const health = new ProviderRouter().getHealth();
    expect(health.providers.primary.configured).toBe(true);
    expect(health.providers.secondary.configured).toBe(true);
    expect(health.providers.anthropic.configured).toBe(true);
    expect(health.providers.deepseek.configured).toBe(true);
    expect(health.providers.anthropic.capabilities.vision).toBe(true);
    expect(health.providers.deepseek.capabilities.vision).toBe(false);
  });

  it('does not send media to a provider without vision capability', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ output_text: 'vision answer' }));
    const router = new ProviderRouter();
    const result = await router.execute({
      prompt: 'analiza esta imagen',
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'analiza' },
        { type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA', detail: 'auto' },
      ] }],
      attachment: { type: 'image', name: 'x.jpg' },
    });
    expect(['primary', 'anthropic']).toContain(result.provider);
    expect(fetchMock.mock.calls[0][0]).not.toContain('deepseek.test');
    expect(fetchMock.mock.calls[0][0]).not.toContain('secondary.test');
  });

  it('converts image content for Anthropic native messages', async () => {
    mockedConfig.routingPolicy = 'secondary';
    mockedConfig.openaiApiKey = '';
    mockedConfig.primaryEndpoint = '';
    mockedConfig.secondaryApiKey = '';
    mockedConfig.secondaryEndpoint = '';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ content: [{ type: 'text', text: 'anthropic vision' }] }));
    const router = new ProviderRouter();
    const result = await router.execute({
      prompt: 'imagen',
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'describe' },
        { type: 'input_image', image_url: 'data:image/png;base64,QUJD' },
      ] }],
      attachment: { type: 'image', name: 'x.png' },
    });
    expect(result.provider).toBe('anthropic');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual(expect.arrayContaining([
      { type: 'text', text: 'describe' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    ]));
  });

  it('does not open the breaker for permanent authentication/configuration errors', async () => {
    mockedConfig.routingPolicy = 'primary';
    const unauthorized = () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }), headers: new Headers() });
    const secondary = ok({ choices: [{ message: { content: 'fallback' } }] });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(unauthorized).mockResolvedValue(secondary);
    const router = new ProviderRouter();
    const result = await router.execute({ prompt: 'hola', input: [{ role: 'user', content: 'hola' }] });
    expect(result.provider).toBe('secondary');
    const primaryHealth = router.getHealth().providers.primary;
    expect(primaryHealth.state).toBe('closed');
    expect(primaryHealth.permanentFailures).toBe(1);
    expect(primaryHealth.consecutiveFailures).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
