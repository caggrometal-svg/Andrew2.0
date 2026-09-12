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

export interface AIRouterOptions extends AICircuitBreakerOptions {
  maxRetriesPerProvider?: number;
  retryBackoffMs?: number;
  requestTimeoutMs?: number;
}

function isProviderError(error: unknown): error is AIProviderError {
  return error instanceof Error && typeof (error as AIProviderError).code === 'string';
}

function isInvalidRequest(error: unknown): boolean {
  return isProviderError(error) && error.code === 'INVALID_REQUEST';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function providerError(code: AIProviderError['code'], message: string, retryable: boolean): AIProviderError {
  const error = new Error(message) as AIProviderError;
  error.code = code;
  error.retryable = retryable;
  return error;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new DOMException('The AI request was aborted.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('The AI request was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function generateWithTimeout(
  provider: AIProvider,
  request: AIRequest,
  timeoutMs: number,
): Promise<AIResponse> {
  if (timeoutMs <= 0) return provider.generate(request);

  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  request.signal?.addEventListener('abort', onAbort, { once: true });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(providerError('TIMEOUT', `AI provider ${provider.id} timed out.`, true));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      provider.generate({ ...request, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    request.signal?.removeEventListener('abort', onAbort);
  }
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

  private async generateForProvider(provider: AIProvider, request: AIRequest): Promise<AIResponse> {
    const maxRetries = Math.max(0, Math.floor(this.options.maxRetriesPerProvider ?? 1));
    const backoffMs = Math.max(0, this.options.retryBackoffMs ?? 250);
    const timeoutMs = Math.max(0, this.options.requestTimeoutMs ?? 30_000);

    let lastError: unknown;
    for (let retry = 0; retry <= maxRetries; retry += 1) {
      if (request.signal?.aborted) {
        throw new DOMException('The AI request was aborted.', 'AbortError');
      }

      try {
        return await generateWithTimeout(provider, request, timeoutMs);
      } catch (error) {
        lastError = error;
        if (isAbortError(error) || isInvalidRequest(error) || !isProviderError(error) || !error.retryable || retry >= maxRetries) {
          throw error;
        }
        await wait(backoffMs * 2 ** retry, request.signal);
      }
    }

    throw lastError ?? providerError('EXECUTION_FAILED', 'AI provider execution failed.', false);
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

        const response = await this.generateForProvider(provider, request);
        breaker.recordSuccess();
        attempts.push({ provider: provider.id, ok: true });
        return { ...response, attempts };
      } catch (error) {
        if (isAbortError(error) && request.signal?.aborted) throw error;
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
