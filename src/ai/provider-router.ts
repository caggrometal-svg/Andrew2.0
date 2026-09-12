import type { AIProvider, AIRequest, AIResponse, AIProviderError } from './provider-contract';
import { AIProviderCircuitBreaker, type AICircuitBreakerOptions } from './provider-circuit-breaker';

export interface AIRouteAttempt {
  provider: string;
  ok: boolean;
  errorCode?: string;
}

export interface AIRouterResult extends AIResponse {
  attempts: AIRouteAttempt[];
}

export interface AIRouterOptions extends AICircuitBreakerOptions {}

function isProviderError(error: unknown): error is AIProviderError {
  return error instanceof Error && typeof (error as AIProviderError).code === 'string';
}

function isInvalidRequest(error: unknown): boolean {
  return isProviderError(error) && error.code === 'INVALID_REQUEST';
}

export class AIProviderRouter {
  private readonly breakers = new Map<string, AIProviderCircuitBreaker>();

  constructor(
    private readonly providers: readonly AIProvider[],
    private readonly options: AIRouterOptions = {},
  ) {}

  private breakerFor(providerId: string): AIProviderCircuitBreaker {
    const existing = this.breakers.get(providerId);
    if (existing) return existing;
    const breaker = new AIProviderCircuitBreaker(this.options);
    this.breakers.set(providerId, breaker);
    return breaker;
  }

  async generate(request: AIRequest): Promise<AIRouterResult> {
    const attempts: AIRouteAttempt[] = [];
    let lastError: unknown = new Error('No AI provider is available.');

    if (request.signal?.aborted) {
      throw new DOMException('The AI request was aborted.', 'AbortError');
    }

    for (const provider of this.providers) {
      const breaker = this.breakerFor(provider.id);
      if (!breaker.allowRequest()) {
        attempts.push({ provider: provider.id, ok: false, errorCode: 'UNAVAILABLE' });
        lastError = new Error(`AI provider ${provider.id} circuit is open.`);
        continue;
      }

      try {
        if (!(await provider.isAvailable())) {
          breaker.recordFailure();
          attempts.push({ provider: provider.id, ok: false, errorCode: 'UNAVAILABLE' });
          lastError = new Error(`AI provider ${provider.id} is unavailable.`);
          continue;
        }

        const response = await provider.generate(request);
        breaker.recordSuccess();
        attempts.push({ provider: provider.id, ok: true });
        return { ...response, attempts };
      } catch (error) {
        lastError = error;
        attempts.push({
          provider: provider.id,
          ok: false,
          errorCode: isProviderError(error) ? error.code : 'EXECUTION_FAILED',
        });

        if (isInvalidRequest(error)) throw error;
        breaker.recordFailure();
      }
    }

    throw lastError;
  }
}
