import { describe, expect, it } from 'vitest';
import type { AIProvider, AIProviderError, AIRequest } from './provider-contract';
import { AIProviderRouter } from './provider-router';

const request: AIRequest = { messages: [{ role: 'user', content: 'ping' }] };

function failure(code: AIProviderError['code'], retryable: boolean): AIProviderError {
  const error = new Error(code) as AIProviderError;
  error.code = code;
  error.retryable = retryable;
  return error;
}

function provider(id: string, generate: AIProvider['generate'], available = true): AIProvider {
  return { id, isAvailable: () => available, generate };
}

describe('AIProviderRouter', () => {
  it('falls back after a retryable provider failure', async () => {
    const first = provider('primary', async () => { throw failure('RATE_LIMITED', true); });
    const second = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const result = await new AIProviderRouter([first, second]).generate(request);
    expect(result.provider).toBe('secondary');
    expect(result.attempts).toEqual([
      { provider: 'primary', ok: false, errorCode: 'RATE_LIMITED' },
      { provider: 'secondary', ok: true },
    ]);
  });

  it('does not bypass non-retryable failures', async () => {
    const first = provider('primary', async () => { throw failure('AUTH_FAILED', false); });
    const second = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'should-not-run', completedAt: '2026-09-12T00:00:00.000Z' }));
    await expect(new AIProviderRouter([first, second]).generate(request)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('skips unavailable providers and preserves attempt order', async () => {
    const unavailable = provider('offline', async () => { throw new Error('must not run'); }, false);
    const available = provider('online', async () => ({ provider: 'online', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const result = await new AIProviderRouter([unavailable, available]).generate(request);
    expect(result.provider).toBe('online');
    expect(result.attempts[0]).toEqual({ provider: 'offline', ok: false, errorCode: 'UNAVAILABLE' });
  });
});
