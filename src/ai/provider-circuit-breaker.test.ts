import { describe, expect, it } from 'vitest';
import { AIProviderCircuitBreaker } from './provider-circuit-breaker';

describe('AIProviderCircuitBreaker', () => {
  it('opens after the configured consecutive failure threshold', () => {
    const breaker = new AIProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });
    expect(breaker.allowRequest(0)).toBe(true);
    breaker.recordFailure(0);
    expect(breaker.allowRequest(1)).toBe(true);
    breaker.recordFailure(1);
    expect(breaker.getState(2)).toBe('open');
    expect(breaker.allowRequest(2)).toBe(false);
  });

  it('permits exactly one half-open probe after cooldown', () => {
    const breaker = new AIProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(0);
    expect(breaker.allowRequest(999)).toBe(false);
    expect(breaker.allowRequest(1000)).toBe(true);
    expect(breaker.getState(1000)).toBe('half-open');
    expect(breaker.allowRequest(1000)).toBe(false);
  });

  it('closes and resets failures after a successful probe', () => {
    const breaker = new AIProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(0);
    expect(breaker.allowRequest(1000)).toBe(true);
    breaker.recordSuccess();
    expect(breaker.getState(1000)).toBe('closed');
    expect(breaker.allowRequest(1001)).toBe(true);
  });

  it('reopens when the half-open probe fails', () => {
    const breaker = new AIProviderCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(0);
    expect(breaker.allowRequest(1000)).toBe(true);
    breaker.recordFailure(1000);
    expect(breaker.getState(1001)).toBe('open');
    expect(breaker.allowRequest(1001)).toBe(false);
  });

  it('can be reset explicitly', () => {
    const breaker = new AIProviderCircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure(0);
    breaker.reset();
    expect(breaker.getState(1)).toBe('closed');
    expect(breaker.allowRequest(1)).toBe(true);
  });
});
