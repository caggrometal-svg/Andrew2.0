import { describe, expect, it } from 'vitest';
import { ProviderRouter } from '../server/ai/provider-router.mjs';

describe('provider registry', () => {
  it('exposes the configured provider registry shape', () => {
    const health = new ProviderRouter().getHealth();
    expect(health).toHaveProperty('providers');
    expect(health.providers).toHaveProperty('primary');
    expect(health.providers).toHaveProperty('secondary');
  });
});
