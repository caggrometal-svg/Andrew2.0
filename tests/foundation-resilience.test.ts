import { describe, expect, it } from 'vitest';
import { AIProviderRouter } from '../src/ai/provider-router';
import type { AIProvider } from '../src/ai/provider-contract';
import { isValidUpdateManifest } from '../src/updates/remote-update-contract';

function provider(id: string, available: boolean, fail = false): AIProvider {
  return {
    id,
    isAvailable: () => available,
    generate: async () => {
      if (fail) {
        const error = new Error('temporary') as Error & { code: string; retryable: boolean };
        error.code = 'UNAVAILABLE';
        error.retryable = true;
        throw error;
      }
      return { provider: id, model: 'test', content: 'ok', completedAt: new Date().toISOString() };
    },
  };
}

describe('foundation resilience', () => {
  it('falls through unavailable and retryable providers', async () => {
    const result = await new AIProviderRouter([
      provider('offline', false),
      provider('primary', true, true),
      provider('fallback', true),
    ]).generate({ messages: [{ role: 'user', content: 'hola' }] });

    expect(result.provider).toBe('fallback');
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.at(-1)?.ok).toBe(true);
  });

  it('rejects unsigned or malformed update manifests', () => {
    expect(isValidUpdateManifest({ id: 'u1', version: '1.0.0' })).toBe(false);
    expect(isValidUpdateManifest({
      id: 'u1', version: '1.0.0', createdAt: '2026-09-12T00:00:00.000Z',
      kind: 'config', target: 'runtime', payloadUrl: 'https://example.invalid/update',
      sha256: 'a'.repeat(64), requiresNativeUpdate: false,
    })).toBe(true);
  });
});
