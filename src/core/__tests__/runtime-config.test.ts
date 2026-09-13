import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_CONFIG, validateRuntimeConfig } from '../config/runtime-config.schema';

describe('runtime config', () => {
  it('exposes immutable safe defaults', () => {
    expect(DEFAULT_RUNTIME_CONFIG.version).toBe(1);
    expect(DEFAULT_RUNTIME_CONFIG.syncEnabled).toBe(true);
    expect(DEFAULT_RUNTIME_CONFIG.timeoutMs).toBe(30_000);
    expect(Object.isFrozen(DEFAULT_RUNTIME_CONFIG)).toBe(true);
  });

  it('validates and freezes a versioned configuration', () => {
    const config = validateRuntimeConfig({
      version: 1,
      revision: 4,
      syncEnabled: true,
      timeoutMs: 45_000,
      pollIntervalMs: 900_000,
      model: 'provider-model',
    });
    expect(config.revision).toBe(4);
    expect(config.model).toBe('provider-model');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('rejects invalid configuration at the boundary', () => {
    expect(() => validateRuntimeConfig({ ...DEFAULT_RUNTIME_CONFIG, timeoutMs: -1 })).toThrow('invalid timeoutMs');
    expect(() => validateRuntimeConfig({ ...DEFAULT_RUNTIME_CONFIG, syncEnabled: 'yes' as never })).toThrow('invalid syncEnabled');
    expect(() => validateRuntimeConfig({ ...DEFAULT_RUNTIME_CONFIG, version: 2 as never })).toThrow('unsupported runtime config version');
  });
});
