import { describe, expect, it, vi } from 'vitest';

const mockedConfig = vi.hoisted(() => ({
  openaiApiKey: 'primary-key', openaiModel: 'primary-model', primaryEndpoint: 'https://primary.test/v1/responses',
  secondaryApiKey: 'secondary-key', secondaryEndpoint: 'https://secondary.test/v1/chat/completions', secondaryModel: 'secondary-model',
  secondaryProtocol: 'chat', secondarySupportsVision: false, routingPolicy: 'balanced', maxAttempts: 1, timeoutMs: 1000,
  providers: { anthropic: { apiKey: '', endpoint: '', model: '', protocol: 'messages', supportsVision: true }, gemini: { apiKey: '', endpoint: '', model: '', protocol: 'gemini', supportsVision: true } },
}));
vi.mock('../server/config.mjs', () => ({ config: mockedConfig }));
import { ProviderRouter } from '../server/ai/provider-router.mjs';

const response = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

describe('Andrew 2.0 multiconnectivity router', () => {
  it('fails over while preserving shared memory', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url) === mockedConfig.primaryEndpoint) return response({ error: { message: 'temporary' } }, 503);
      const body = JSON.parse(options.body);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'Memoria compartida de Andrew:\nmemoria-A\nmemoria-B' });
      return response({ choices: [{ message: { content: 'secondary answer' } }] });
    });
    const router = new ProviderRouter();
    const result = await router.execute({ prompt: 'continúa', memory: ['memoria-A', 'memoria-B'] });
    expect(result.provider).toBe('secondary');
    expect(result.text).toBe('secondary answer');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(router.getHealth().providers.secondary.ok).toBe(true);
    fetchMock.mockRestore();
  });

  it('reports configured providers and does not expose credentials', () => {
    const health = new ProviderRouter().getHealth();
    expect(health.providers.openai).toMatchObject({ configured: true, model: 'primary-model', protocol: 'responses' });
    expect(JSON.stringify(health)).not.toContain('primary-key');
    expect(JSON.stringify(health)).not.toContain('secondary-key');
  });
});
