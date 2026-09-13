import { describe, expect, it, vi } from 'vitest';

const mockedConfig = vi.hoisted(() => ({
  openaiApiKey: 'primary-key',
  openaiModel: 'primary-model',
  primaryEndpoint: 'https://primary.test/v1/responses',
  secondaryApiKey: 'secondary-key',
  secondaryEndpoint: 'https://secondary.test/v1/chat/completions',
  secondaryModel: 'secondary-model',
  secondarySupportsVision: false,
  routingPolicy: 'primary',
  providers: {
    anthropic: { apiKey: '', endpoint: '', model: '', protocol: 'messages', supportsVision: true },
    deepseek: { apiKey: '', endpoint: '', model: '', protocol: 'chat', supportsVision: false },
    groq: { apiKey: '', endpoint: '', model: '', protocol: 'chat', supportsVision: false },
    gemini: { apiKey: '', endpoint: '', model: '', protocol: 'chat', supportsVision: true },
  },
}));

vi.mock('../server/config.mjs', () => ({ config: mockedConfig }));
import { ProviderRouter } from '../server/ai/provider-router.mjs';

const response = (json, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
  headers: new Headers(),
});

describe('Phase 29 provider memory propagation', () => {
  it('preserves shared memory when routing from the primary provider to the secondary provider', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === mockedConfig.primaryEndpoint) return response({ error: { message: 'temporary' } }, 503);
      return response({ choices: [{ message: { content: 'secondary answer' } }] });
    });

    const router = new ProviderRouter();
    const result = await router.execute({
      prompt: 'continúa',
      input: [{ role: 'user', content: 'continúa' }],
      memory: ['El usuario prefiere respuestas precisas.', 'El proyecto activo es Andrew 2.0.'],
    });

    expect(result.provider).toBe('secondary');
    const secondaryCall = fetchMock.mock.calls.find(([url]) => String(url) === mockedConfig.secondaryEndpoint);
    expect(secondaryCall).toBeDefined();
    const body = JSON.parse(secondaryCall[1].body);
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'Memoria compartida de Andrew:\nEl usuario prefiere respuestas precisas.\nEl proyecto activo es Andrew 2.0.',
    });
    expect(body.messages[1]).toEqual({ role: 'user', content: [{ type: 'text', text: 'continúa' }] });
  });
});
