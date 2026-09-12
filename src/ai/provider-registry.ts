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
}

export interface AIProviderRegistryOptions {
  availabilityTimeoutMs?: number;
}

export class AIProviderRegistry {
  private readonly registrations = new Map<string, AIProviderRegistration>();
  private readonly options: Required<AIProviderRegistryOptions>;

  constructor(registrations: readonly AIProviderRegistration[] = [], options: AIProviderRegistryOptions = {}) {
    this.options = { availabilityTimeoutMs: Math.max(1, Math.floor(options.availabilityTimeoutMs ?? 5_000)) };
    for (const registration of registrations) this.register(registration);
  }

  register(registration: AIProviderRegistration): void {
    const id = registration.provider.id.trim();
    if (!id) throw new Error('AI provider id cannot be empty.');
    if (this.registrations.has(id)) throw new Error(`AI provider ${id} is already registered.`);
    if (!Number.isFinite(registration.priority)) throw new Error(`AI provider ${id} has an invalid priority.`);
    this.registrations.set(id, { ...registration, enabled: registration.enabled ?? true });
  }

  unregister(id: string): boolean { return this.registrations.delete(id); }

  setEnabled(id: string, enabled: boolean): void {
    const registration = this.registrations.get(id);
    if (!registration) throw new Error(`AI provider ${id} is not registered.`);
    registration.enabled = enabled;
  }

  get(id: string): AIProviderRegistration | undefined { return this.registrations.get(id); }

  list(): readonly AIProviderRegistration[] {
    return [...this.registrations.values()].sort((a, b) => a.priority - b.priority || a.provider.id.localeCompare(b.provider.id));
  }

  enabledProviders(): readonly AIProvider[] {
    return this.list().filter((registration) => registration.enabled).map((registration) => registration.provider);
  }

  async health(): Promise<readonly AIProviderHealth[]> {
    const results = await Promise.all(this.list().map(async (registration) => {
      const enabled = registration.enabled ?? true;
      if (!enabled) return { id: registration.provider.id, priority: registration.priority, enabled, available: false, status: 'unavailable' as const };
      try {
        const available = await Promise.race([
          Promise.resolve(registration.provider.isAvailable()),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('availability timeout')), this.options.availabilityTimeoutMs)),
        ]);
        return { id: registration.provider.id, priority: registration.priority, enabled, available, status: available ? 'healthy' as const : 'unavailable' as const };
      } catch {
        return { id: registration.provider.id, priority: registration.priority, enabled, available: false, status: 'degraded' as const };
      }
    }));
    return results.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  }
}
