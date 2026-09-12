import type { AIProvider, AIRequest, AIResponse, AIProviderError } from './provider-contract';

export interface AIRouteAttempt {
  provider: string;
  ok: boolean;
  errorCode?: string;
}

export interface AIRouterResult extends AIResponse {
  attempts: AIRouteAttempt[];
}

function isProviderError(error: unknown): error is AIProviderError {
  return error instanceof Error && typeof (error as AIProviderError).code === 'string';
}

function isRetryable(error: unknown): boolean {
  return isProviderError(error) ? error.retryable : true;
}

export class AIProviderRouter {
  constructor(private readonly providers: readonly AIProvider[]) {}

  async generate(request: AIRequest): Promise<AIRouterResult> {
    const attempts: AIRouteAttempt[] = [];
    let lastError: unknown = new Error('No AI provider is available.');

    for (const provider of this.providers) {
      try {
        if (!(await provider.isAvailable())) {
          attempts.push({ provider: provider.id, ok: false, errorCode: 'UNAVAILABLE' });
          continue;
        }

        const response = await provider.generate(request);
        attempts.push({ provider: provider.id, ok: true });
        return { ...response, attempts };
      } catch (error) {
        lastError = error;
        attempts.push({
          provider: provider.id,
          ok: false,
          errorCode: isProviderError(error) ? error.code : 'EXECUTION_FAILED',
        });

        if (!isRetryable(error)) throw error;
      }
    }

    throw lastError;
  }
}
