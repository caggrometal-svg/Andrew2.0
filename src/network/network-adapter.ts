import { IAC33_NETWORK_POLICY, type NetworkCapability } from './access-policy';

export interface NetworkAdapterRequest {
  capability: NetworkCapability;
  input: RequestInfo | URL;
  init?: RequestInit;
  timeoutMs?: number;
}

export interface NetworkAdapterResponse {
  response: Response;
  elapsedMs: number;
}

export interface NetworkAdapter {
  request(request: NetworkAdapterRequest): Promise<NetworkAdapterResponse>;
}

export class NetworkAccessDeniedError extends Error {
  readonly code = 'NETWORK_ACCESS_DENIED';
  readonly capability: NetworkCapability;

  constructor(capability: NetworkCapability) {
    super(`Network capability denied: ${capability}`);
    this.name = 'NetworkAccessDeniedError';
    this.capability = capability;
  }
}

export interface FetchNetworkAdapterOptions {
  defaultTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class FetchNetworkAdapter implements NetworkAdapter {
  private readonly defaultTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: FetchNetworkAdapterOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async request(request: NetworkAdapterRequest): Promise<NetworkAdapterResponse> {
    const policy = IAC33_NETWORK_POLICY[request.capability];
    if (!policy.enabled) throw new NetworkAccessDeniedError(request.capability);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), request.timeoutMs ?? this.defaultTimeoutMs);
    const callerSignal = request.init?.signal;
    const abortFromCaller = (): void => controller.abort();

    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    }

    const startedAt = this.now();
    try {
      const response = await this.fetchImpl(request.input, { ...request.init, signal: controller.signal });
      return { response, elapsedMs: Math.max(0, this.now() - startedAt) };
    } finally {
      window.clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }
}
