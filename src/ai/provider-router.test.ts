import { describe, expect, it } from 'vitest';
import { AIProviderRegistry } from './provider-registry';
import { AIProviderRouter } from './provider-router';
import type { AIProvider, AIProviderError, AIRequest } from './provider-contract';

const request: AIRequest = { messages: [{ role: 'user', content: 'test' }] };

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
  it('falls back to the next provider after a rate limit', async () => {
    const first = provider('first', async () => { throw failure('RATE_LIMITED', true); });
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second], { maxRetriesPerProvider: 0, retryBackoffMs: 0 });

    const result = await router.generate(request);

    expect(result.provider).toBe('second');
    expect(result.attempts).toEqual([
      { provider: 'first', ok: false, errorCode: 'RATE_LIMITED' },
      { provider: 'second', ok: true },
    ]);
  });

  it('retries retryable provider failures before failing over', async () => {
    let calls = 0;
    const first = provider('first', async () => {
      calls += 1;
      throw failure('RATE_LIMITED', true);
    });
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second], { maxRetriesPerProvider: 1, retryBackoffMs: 0 });

    const result = await router.generate(request);

    expect(result.provider).toBe('second');
    expect(calls).toBe(2);
    expect(result.attempts).toEqual([
      { provider: 'first', ok: false, errorCode: 'RATE_LIMITED' },
      { provider: 'first', ok: false, errorCode: 'RATE_LIMITED' },
      { provider: 'second', ok: true },
    ]);
  });

  it('fails over after authentication failure', async () => {
    const first = provider('first', async () => { throw failure('AUTH_FAILED', false); });
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second], { maxRetriesPerProvider: 0 });

    const result = await router.generate(request);

    expect(result.provider).toBe('second');
  });

  it('fails over after timeout', async () => {
    const first = provider('first', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { provider: 'first', model: 'test', content: 'late', completedAt: '2026-09-12T00:00:00.000Z' };
    });
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second], { requestTimeoutMs: 1 });

    const result = await router.generate(request);

    expect(result.provider).toBe('second');
    expect(result.attempts[0]).toMatchObject({ provider: 'first', ok: false, errorCode: 'TIMEOUT' });
  });

  it('does not fail over after an invalid request', async () => {
    let calls = 0;
    const first = provider('first', async () => { calls += 1; throw failure('INVALID_REQUEST', false); });
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second]);

    await expect(router.generate(request)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(calls).toBe(1);
  });

  it('skips unavailable providers', async () => {
    let calls = 0;
    const first = provider('first', async () => { calls += 1; throw failure('EXECUTION_FAILED', false); }, false);
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second]);

    const result = await router.generate(request);

    expect(result.provider).toBe('second');
    expect(calls).toBe(0);
  });

  it('opens a provider circuit after repeated failures', async () => {
    let calls = 0;
    const first = provider('first', async () => { calls += 1; throw failure('EXECUTION_FAILED', false); });
    const second = provider('second', async () => ({ provider: 'second', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([first, second], { maxRetriesPerProvider: 0 });

    await router.generate(request);
    await router.generate(request);

    expect(calls).toBe(2);
  });

  it('uses registry priority and health to route and records provider outcomes', async () => {
    let primaryCalls = 0;
    const primary = provider('primary', async () => {
      primaryCalls += 1;
      if (primaryCalls === 1) throw failure('EXECUTION_FAILED', false);
      return { provider: 'primary', model: 'test', content: 'recovered', completedAt: '2026-09-12T00:00:00.000Z' };
    });
    const secondary = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const registry = new AIProviderRegistry([
      { provider: secondary, priority: 20 },
      { provider: primary, priority: 10 },
    ], { failureThreshold: 2 });
    const router = new AIProviderRouter([secondary, primary], {}, registry);

    const first = await router.generate(request);
    expect(first.provider).toBe('secondary');
    expect(primaryCalls).toBe(1);

    registry.setEnabled('secondary', false);
    const second = await router.generate(request);
    expect(second.provider).toBe('primary');
    expect(primaryCalls).toBe(2);
    expect(registry.routableProviders().map((item) => item.id)).toEqual(['primary']);

    const health = await registry.health();
    expect(health.find((item) => item.id === 'primary')).toMatchObject({ status: 'healthy', available: true, consecutiveFailures: 0 });
  });
});
