export type AICircuitState = 'closed' | 'open' | 'half-open';

export interface AICircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class AIProviderCircuitBreaker {
  private state: AICircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: AICircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, Math.floor(options.failureThreshold ?? 3));
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 30_000);
  }

  getState(now = Date.now()): AICircuitState {
    if (this.state === 'open' && now - this.openedAt >= this.cooldownMs) {
      this.state = 'half-open';
      this.probeInFlight = false;
    }
    return this.state;
  }

  allowRequest(now = Date.now()): boolean {
    const state = this.getState(now);
    if (state === 'closed') return true;
    if (state === 'open') return false;
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }

  recordFailure(now = Date.now()): void {
    this.probeInFlight = false;
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = now;
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }
}
