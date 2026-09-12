import { describe, expect, it } from 'vitest';
import type { AIProvider } from './provider-contract';
import { AIProviderRegistry } from './provider-registry';

function provider(id: string, available: boolean | (() => Promise<boolean>)): AIProvider {
  return {
    id,
    isAvailable: typeof available === 'function' ? available : () => available,
    generate: async () => ({ provider: id, model: 'test', content: 'ok', completedAt: '2026-09-12T00:00:00.000Z' }),
  };
}

describe('AIProviderRegistry', () => {
  it('orders providers deterministically by priority and id', () => {
    const registry = new AIProviderRegistry([
      { provider: provider('zeta', true), priority: 10 },
      { provider: provider('alpha', true), priority: 10 },
      { provider: provider('primary', true), priority: 1 },
    ]);
    expect(registry.list().map((item) => item.provider.id)).toEqual(['primary', 'alpha', 'zeta']);
    expect(registry.enabledProviders().map((item) => item.id)).toEqual(['primary', 'alpha', 'zeta']);
  });

  it('rejects duplicate ids, blank ids, untrimmed ids, and negative priorities', () => {
    const registry = new AIProviderRegistry([{ provider: provider('primary', true), priority: 1 }]);
    expect(() => registry.register({ provider: provider('primary', true), priority: 2 })).toThrow('already registered');
    expect(() => registry.register({ provider: provider('   ', true), priority: 2 })).toThrow('non-empty and trimmed');
    expect(() => registry.register({ provider: provider(' spaced ', true), priority: 2 })).toThrow('non-empty and trimmed');
    expect(() => registry.register({ provider: provider('negative', true), priority: -1 })).toThrow('invalid priority');
  });

  it('excludes disabled providers', async () => {
    const registry = new AIProviderRegistry([
      { provider: provider('disabled', true), priority: 1, enabled: false },
      { provider: provider('enabled', true), priority: 2 },
    ]);
    expect(registry.enabledProviders().map((item) => item.id)).toEqual(['enabled']);
    const health = await registry.health();
    expect(health[0]).toMatchObject({ id: 'disabled', priority: 1, enabled: false, available: false, status: 'unavailable', consecutiveFailures: 0 });
    expect(health[1]).toMatchObject({ id: 'enabled', priority: 2, enabled: true, available: true, status: 'healthy', consecutiveFailures: 0 });
  });

  it('reports unavailable and degraded providers', async () => {
    const registry = new AIProviderRegistry([
      { provider: provider('offline', false), priority: 2 },
      { provider: provider('stuck', () => new Promise(() => undefined)), priority: 3 },
    ], { availabilityTimeoutMs: 5, failureThreshold: 3 });
    const health = await registry.health();
    expect(health[0]).toMatchObject({ id: 'offline', priority: 2, enabled: true, available: false, status: 'degraded', consecutiveFailures: 1, lastErrorCode: 'UNAVAILABLE' });
    expect(health[1]).toMatchObject({ id: 'stuck', priority: 3, enabled: true, available: false, status: 'degraded', consecutiveFailures: 1, lastErrorCode: 'AVAILABILITY_TIMEOUT' });
  });

  it('recovers health after successful availability check', async () => {
    let available = false;
    const registry = new AIProviderRegistry([{ provider: provider('recovering', () => Promise.resolve(available)), priority: 1 }], { failureThreshold: 2 });
    const first = await registry.health();
    expect(first[0]).toMatchObject({ status: 'degraded', consecutiveFailures: 1 });
    available = true;
    const second = await registry.health();
    expect(second[0]).toMatchObject({ status: 'healthy', available: true, consecutiveFailures: 0 });
  });

  it('transitions repeated failures to unavailable and supports explicit recovery', async () => {
    const registry = new AIProviderRegistry([{ provider: provider('unstable', false), priority: 1 }], { failureThreshold: 2 });
    await registry.health();
    await registry.health();
    expect((await registry.health())[0]).toMatchObject({ status: 'unavailable', consecutiveFailures: 3 });
    registry.recordSuccess('unstable');
    expect((await registry.health())[0]).toMatchObject({ status: 'degraded', consecutiveFailures: 1 });
  });

  it('supports enabling and disabling registered providers', () => {
    const registry = new AIProviderRegistry([{ provider: provider('primary', true), priority: 1 }]);
    registry.setEnabled('primary', false);
    expect(registry.enabledProviders()).toHaveLength(0);
    registry.setEnabled('primary', true);
    expect(registry.enabledProviders()).toHaveLength(1);
    expect(registry.unregister('primary')).toBe(true);
    expect(registry.unregister('primary')).toBe(false);
  });
});
