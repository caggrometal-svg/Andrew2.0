import { describe, expect, it } from 'vitest';
import type { AIProvider, AIProviderError, AIRequest } from './provider-contract';
import { AIProviderRegistry } from './provider-registry';
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
  it('falls back after a provider-local rate-limit failure', async () => {
    const first = provider('primary', async () => { throw failure('RATE_LIMITED', true); });
    const second = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const result = await new AIProviderRouter([first, second], { retryBackoffMs: 0 }).generate(request);
    expect(result.provider).toBe('secondary');
    expect(result.attempts).toEqual([
      { provider: 'primary', ok: false, errorCode: 'RATE_LIMITED' },
      { provider: 'secondary', ok: true },
    ]);
  });

  it('retries a retryable provider failure before failing over', async () => {
    let calls = 0;
    const first = provider('primary', async () => {
      calls += 1;
      if (calls === 1) throw failure('EXECUTION_FAILED', true);
      return { provider: 'primary', model: 'test', content: 'recovered', completedAt: '2026-09-12T00:00:00.000Z' };
    });
    const result = await new AIProviderRouter([first], { maxRetriesPerProvider: 1, retryBackoffMs: 0 }).generate(request);
    expect(calls).toBe(2);
    expect(result.provider).toBe('primary');
    expect(result.content).toBe('recovered');
  });

  it('fails over after an auth failure instead of blocking other providers', async () => {
    const first = provider('primary', async () => { throw failure('AUTH_FAILED', false); });
    const second = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const result = await new AIProviderRouter([first, second]).generate(request);
    expect(result.provider).toBe('secondary');
  });

  it('fails over after a provider timeout', async () => {
    const first = provider('primary', async () => new Promise(() => undefined));
    const second = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const result = await new AIProviderRouter([first, second], { requestTimeoutMs: 5, maxRetriesPerProvider: 0 }).generate(request);
    expect(result.provider).toBe('secondary');
    expect(result.attempts[0]).toEqual({ provider: 'primary', ok: false, errorCode: 'TIMEOUT' });
  });

  it('does not fail over an invalid request', async () => {
    let secondaryCalled = false;
    const first = provider('primary', async () => { throw failure('INVALID_REQUEST', false); });
    const second = provider('secondary', async () => {
      secondaryCalled = true;
      return { provider: 'secondary', model: 'test', content: 'should-not-run', completedAt: '2026-09-12T00:00:00.000Z' };
    });
    await expect(new AIProviderRouter([first, second]).generate(request)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(secondaryCalled).toBe(false);
  });

  it('skips unavailable providers and preserves attempt order', async () => {
    const unavailable = provider('offline', async () => { throw new Error('must not run'); }, false);
    const available = provider('online', async () => ({ provider: 'online', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const result = await new AIProviderRouter([unavailable, available]).generate(request);
    expect(result.provider).toBe('online');
    expect(result.attempts[0]).toEqual({ provider: 'offline', ok: false, errorCode: 'UNAVAILABLE' });
  });

  it('opens a provider circuit after repeated failures and skips it on later requests', async () => {
    let calls = 0;
    const failing = provider('primary', async () => {
      calls += 1;
      throw failure('EXECUTION_FAILED', true);
    });
    const fallback = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const router = new AIProviderRouter([failing, fallback], { failureThreshold: 2, cooldownMs: 60_000, maxRetriesPerProvider: 0 });

    await router.generate(request);
    await router.generate(request);
    await router.generate(request);

    expect(calls).toBe(2);
  });

  it('uses registry priority and health to route and records provider outcomes', async () => {
    let primaryCalls = 0;
    const primary = provider('primary', async () => {
      primaryCalls += 1;
      throw failure('EXECUTION_FAILED', false);
    });
    const secondary = provider('secondary', async () => ({ provider: 'secondary', model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }));
    const registry = new AIProviderRegistry([
      { provider: secondary, priority: 20 },
      { provider: primary, priority: 10 },
    ], { failureThreshold: 1 });
    const router = new AIProviderRouter([secondary, primary], {}, registry);

    const first = await router.generate(request);
    expect(first.provider).toBe('secondary');
    expect(primaryCalls).toBe(0);

    registry.setEnabled('secondary', false);
    const second = await router.generate(request);
    expect(second.provider).toBe('primary');
    expect(primaryCalls).toBe(1);

    const health = await registry.health();
    expect(health.find((item) => item.id === 'primary')).toMatchObject({ status: 'unavailable', consecutiveFailures: 2 });
    expect(registry.routableProviders().map((item) => item.id)).toEqual([]);
  });
});
