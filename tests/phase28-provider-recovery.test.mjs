import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockedConfig = {
  openaiApiKey: 'primary-key', openaiModel: 'primary-model', primaryEndpoint: 'https://primary.test/v1/responses',
  secondaryApiKey: 'secondary-key', secondaryEndpoint: 'https://secondary.test/v1/chat/completions', secondaryModel: 'secondary-model', secondarySupportsVision: true,
  routingPolicy: 'primary',
  providers: {
    anthropic: { apiKey: '', endpoint: '', model: '', protocol: 'messages', supportsVision: true },
    deepseek: { apiKey: '', endpoint: '', model: '', protocol: 'chat', supportsVision: false },
    groq: { apiKey: '', endpoint: '', model: '', protocol: 'chat', supportsVision: false },
    gemini: { apiKey: '', endpoint: '', model: '', protocol: 'chat', supportsVision: true },
  },
};

vi.mock('../server/config.mjs', () => ({ config: mockedConfig }));
import { ProviderRouter } from '../server/ai/provider-router.mjs';

beforeEach(() => { mockedConfig.routingPolicy = 'primary'; vi.restoreAllMocks(); });
afterEach(() => vi.useRealTimers());

const response = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => json, headers: new Headers() });
const request = (prompt) => ({ prompt, input: [{ role: 'user', content: prompt }] });
async function executeWithTimers(router, value) { const pending = router.execute(value); await vi.runAllTimersAsync(); return pending; }

describe('Phase 28 provider recovery', () => {
  it('recovers a tripped breaker through a successful half-open probe', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => url === 'https://primary.test/v1/responses'
      ? response({ error: { message: 'temporary' } }, 503)
      : response({ choices: [{ message: { content: 'fallback' } }] }));
    const router = new ProviderRouter();
    for (let i = 0; i < 3; i += 1) await executeWithTimers(router, request(`trip-${i}`));
    expect(router.getHealth().providers.primary.state).toBe('open');
    await vi.advanceTimersByTimeAsync(30_001);
    fetchMock.mockImplementation(async (url) => url === 'https://primary.test/v1/responses'
      ? response({ output_text: 'recovered' })
      : response({ choices: [{ message: { content: 'fallback' } }] }));
    const result = await executeWithTimers(router, request('recovery-probe'));
    expect(result.provider).toBe('primary');
    expect(result.text).toBe('recovered');
    expect(router.getHealth().providers.primary.state).toBe('closed');
    expect(router.getHealth().providers.primary.consecutiveFailures).toBe(0);
    expect(router.getHealth().providers.primary.openUntil).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('does not probe an open provider before cooldown and falls back immediately', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => url === 'https://primary.test/v1/responses'
      ? response({ error: { message: 'temporary' } }, 503)
      : response({ choices: [{ message: { content: 'secondary fallback' } }] }));
    const router = new ProviderRouter();
    for (let i = 0; i < 3; i += 1) await executeWithTimers(router, request(`open-${i}`));
    const result = await executeWithTimers(router, request('fallback-while-open'));
    expect(result.provider).toBe('secondary');
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(fetchMock.mock.calls[9][0]).toBe('https://secondary.test/v1/chat/completions');
  });

  it('keeps media on providers that advertise vision support', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ output_text: 'vision ok' }));
    const router = new ProviderRouter();
    const result = await router.execute({ prompt: 'analiza', input: [{ role: 'user', content: [
      { type: 'input_text', text: 'imagen' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' },
    ] }], attachment: { type: 'image', name: 'x.jpg' } });
    expect(result.provider).toBe('primary');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input[0].content).toEqual(expect.arrayContaining([{ type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' }]));
  });

  it('translates vision input to OpenAI-compatible image_url for generic chat providers', async () => {
    mockedConfig.routingPolicy = 'secondary';
    mockedConfig.secondarySupportsVision = true;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ choices: [{ message: { content: 'secondary vision' } }] }));
    const router = new ProviderRouter();
    const result = await router.execute({ prompt: 'vision-secondary', input: [{ role: 'user', content: [
      { type: 'input_text', text: 'describe esta imagen' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' },
    ] }], attachment: { type: 'image', name: 'vision.jpg' } });
    expect(result.provider).toBe('secondary');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'describe esta imagen' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
  });
});
