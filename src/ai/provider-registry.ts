import type { AIProvider } from './provider-contract';

export type AIProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable';

export interface AIProviderRegistration {
  provider: AIProvider;
  priority: number;
  enabled?: boolean;
}

export interface AIProviderHealth {
  id: string;
  priority: number;
  enabled: boolean;
  available: boolean;
  status: AIProviderHealthStatus;
  consecutiveFailures: number;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastErrorCode?: string;
}

export interface AIProviderRegistryOptions {
  availabilityTimeoutMs?: number;
  failureThreshold?: number;
}

interface ProviderHealthState {
  consecutiveFailures: number;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastErrorCode?: string;
}

export class AIProviderRegistry {
  private readonly registrations = new Map<string, AIProviderRegistration>();
  private readonly healthState = new Map<string, ProviderHealthState>();
  private readonly options: Required<AIProviderRegistryOptions>;

  constructor(registrations: readonly AIProviderRegistration[] = [], options: AIProviderRegistryOptions = {}) {
    this.options = {
      availabilityTimeoutMs: Math.max(1, Math.floor(options.availabilityTimeoutMs ?? 5_000)),
      failureThreshold: Math.max(1, Math.floor(options.failureThreshold ?? 3)),
    };
    for (const registration of registrations) this.register(registration);
  }

  register(registration: AIProviderRegistration): void {
    const id = registration.provider.id;
    if (!id.trim() || id !== id.trim()) throw new Error('AI provider id must be non-empty and trimmed.');
    if (this.registrations.has(id)) throw new Error(`AI provider ${id} is already registered.`);
    if (!Number.isFinite(registration.priority) || registration.priority < 0) {
      throw new Error(`AI provider ${id} has an invalid priority.`);
    }
    this.registrations.set(id, { ...registration, enabled: registration.enabled ?? true });
    this.healthState.set(id, { consecutiveFailures: 0 });
  }

  unregister(id: string): boolean {
    const removed = this.registrations.delete(id);
    if (removed) this.healthState.delete(id);
    return removed;
  }

  setEnabled(id: string, enabled: boolean): void {
    const registration = this.registrations.get(id);
    if (!registration) throw new Error(`AI provider ${id} is not registered.`);
    registration.enabled = enabled;
  }

  get(id: string): AIProviderRegistration | undefined {
    const registration = this.registrations.get(id);
    return registration ? { ...registration } : undefined;
  }

  list(): readonly AIProviderRegistration[] {
    return this.sortedRegistrations().map((registration) => ({ ...registration }));
  }

  enabledProviders(): readonly AIProvider[] {
    return this.sortedRegistrations()
      .filter((registration) => registration.enabled)
      .map((registration) => registration.provider);
  }

  routableProviders(): readonly AIProvider[] {
    return this.sortedRegistrations()
      .filter((registration) => {
        if (!registration.enabled) return false;
        const state = this.requireHealthState(registration.provider.id);
        return state.consecutiveFailures < this.options.failureThreshold;
      })
      .map((registration) => registration.provider);
  }

  recordSuccess(id: string): void {
    const state = this.requireHealthState(id);
    state.consecutiveFailures = 0;
    state.lastSuccessAt = new Date().toISOString();
    delete state.lastErrorCode;
  }

  recordFailure(id: string, errorCode?: string): void {
    const state = this.requireHealthState(id);
    state.consecutiveFailures += 1;
    state.lastFailureAt = new Date().toISOString();
    if (errorCode !== undefined) state.lastErrorCode = errorCode;
    else delete state.lastErrorCode;
  }

  async health(): Promise<readonly AIProviderHealth[]> {
    await Promise.all(this.sortedRegistrations().map(async (registration) => {
      const enabled = registration.enabled ?? true;
      if (!enabled) {
        this.markChecked(registration.provider.id);
        return;
      }

      try {
        const available = await this.checkAvailability(registration.provider);
        this.markChecked(registration.provider.id);
        if (available) {
          this.recordSuccess(registration.provider.id);
        } else {
          this.recordFailure(registration.provider.id, 'UNAVAILABLE');
        }
      } catch (error) {
        this.markChecked(registration.provider.id);
        this.recordFailure(registration.provider.id, error instanceof Error ? error.message : 'AVAILABILITY_CHECK_FAILED');
      }
    }));

    return this.sortedRegistrations().map((registration) => {
      const id = registration.provider.id;
      const enabled = registration.enabled ?? true;
      const state = this.requireHealthState(id);
      const status: AIProviderHealthStatus = !enabled
        ? 'unavailable'
        : state.consecutiveFailures >= this.options.failureThreshold
          ? 'unavailable'
          : state.consecutiveFailures > 0
            ? 'degraded'
            : 'healthy';

      const health: AIProviderHealth = {
        id,
        priority: registration.priority,
        enabled,
        available: status === 'healthy',
        status,
        consecutiveFailures: state.consecutiveFailures,
      };
      if (state.lastCheckedAt !== undefined) health.lastCheckedAt = state.lastCheckedAt;
      if (state.lastSuccessAt !== undefined) health.lastSuccessAt = state.lastSuccessAt;
      if (state.lastFailureAt !== undefined) health.lastFailureAt = state.lastFailureAt;
      if (state.lastErrorCode !== undefined) health.lastErrorCode = state.lastErrorCode;
      return health;
    });
  }

  private sortedRegistrations(): AIProviderRegistration[] {
    return [...this.registrations.values()].sort(
      (a, b) => a.priority - b.priority || a.provider.id.localeCompare(b.provider.id),
    );
  }

  private requireHealthState(id: string): ProviderHealthState {
    const state = this.healthState.get(id);
    if (!state) throw new Error(`AI provider ${id} is not registered.`);
    return state;
  }

  private markChecked(id: string): void {
    this.requireHealthState(id).lastCheckedAt = new Date().toISOString();
  }

  private async checkAvailability(provider: AIProvider): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(provider.isAvailable()),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('AVAILABILITY_TIMEOUT')), this.options.availabilityTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
