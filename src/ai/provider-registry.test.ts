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

  it('rejects duplicate provider ids', () => {
    const registry = new AIProviderRegistry([{ provider: provider('primary', true), priority: 1 }]);
    expect(() => registry.register({ provider: provider('primary', true), priority: 2 })).toThrow('already registered');
  });

  it('excludes disabled providers', async () => {
    const registry = new AIProviderRegistry([
      { provider: provider('disabled', true), priority: 1, enabled: false },
      { provider: provider('enabled', true), priority: 2 },
    ]);
    expect(registry.enabledProviders().map((item) => item.id)).toEqual(['enabled']);
    await expect(registry.health()).resolves.toEqual([
      { id: 'disabled', priority: 1, enabled: false, available: false, status: 'unavailable' },
      { id: 'enabled', priority: 2, enabled: true, available: true, status: 'healthy' },
    ]);
  });

  it('reports unavailable and degraded providers', async () => {
    const registry = new AIProviderRegistry([
      { provider: provider('offline', false), priority: 2 },
      { provider: provider('stuck', () => new Promise(() => undefined)), priority: 3 },
    ], { availabilityTimeoutMs: 5 });
    await expect(registry.health()).resolves.toEqual([
      { id: 'offline', priority: 2, enabled: true, available: false, status: 'unavailable' },
      { id: 'stuck', priority: 3, enabled: true, available: false, status: 'degraded' },
    ]);
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
