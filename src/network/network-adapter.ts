import { IAC33_NETWORK_POLICY, type NetworkCapability } from './access-policy';

export type NetworkRequestInput = string | URL;
export type NetworkFetchImplementation = (input: NetworkRequestInput, init?: RequestInit) => Promise<Response>;

export interface NetworkAdapterRequest {
  capability: NetworkCapability;
  input: NetworkRequestInput;
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
  fetchImpl?: NetworkFetchImplementation;
  now?: () => number;
}

export class FetchNetworkAdapter implements NetworkAdapter {
  private readonly defaultTimeoutMs: number;
  private readonly fetchImpl: NetworkFetchImplementation;
  private readonly now: () => number;

  constructor(options: FetchNetworkAdapterOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? (() => Date.now());
  }

  async request(request: NetworkAdapterRequest): Promise<NetworkAdapterResponse> {
    const policy = IAC33_NETWORK_POLICY[request.capability];
    if (!policy.enabled) throw new NetworkAccessDeniedError(request.capability);

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), request.timeoutMs ?? this.defaultTimeoutMs);
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
      globalThis.clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }
}
