import type {
  AndrewBridgeNative,
  BridgeCommand,
  BridgeEvent,
  BridgeMessage,
  BridgeResponse,
} from './types';

export type BridgeEventHandler<TPayload = unknown> = (event: BridgeEvent<TPayload>) => void;

export interface BridgeRequestOptions {
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10000;

function bridge(): AndrewBridgeNative {
  if (!window.AndrewBridge) {
    throw new Error('AndrewBridge no está disponible en el entorno nativo.');
  }
  return window.AndrewBridge;
}

function createId(): string {
  return `bridge-${crypto.randomUUID()}`;
}

function createCommand<TPayload>(method: string, payload: TPayload): BridgeCommand<TPayload> {
  return {
    id: createId(),
    type: 'command',
    method,
    payload,
    timestamp: Date.now(),
    version: '1',
  };
}

export class AndrewBridgeClient {
  private readonly listeners = new Map<string, Set<BridgeEventHandler>>();
  private readonly responseListeners = new Map<string, (response: BridgeResponse) => void>();

  constructor(private readonly nativeBridge: AndrewBridgeNative = bridge()) {}

  async send<TPayload = unknown>(method: string, payload: TPayload = {} as TPayload): Promise<void> {
    const command = createCommand(method, payload);
    await this.nativeBridge.send(command);
  }

  async request<TPayload = unknown, TResponse = unknown>(
    method: string,
    payload: TPayload = {} as TPayload,
    options: BridgeRequestOptions = {},
  ): Promise<BridgeResponse<TResponse>> {
    const command = createCommand(method, payload);
    const requestMethod = this.nativeBridge.request;

    if (requestMethod) {
      return await requestMethod(command) as BridgeResponse<TResponse>;
    }

    await this.nativeBridge.send(command);
    return await this.waitForResponse<TResponse>(command.id, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  on<TPayload = unknown>(method: string, handler: BridgeEventHandler<TPayload>): () => void {
    const handlers = this.listeners.get(method) ?? new Set<BridgeEventHandler>();
    handlers.add(handler as BridgeEventHandler);
    this.listeners.set(method, handlers);
    return () => {
      handlers.delete(handler as BridgeEventHandler);
      if (handlers.size === 0) this.listeners.delete(method);
    };
  }

  handleMessage(message: BridgeMessage): void {
    if (message.type === 'event') {
      this.listeners.get(message.method)?.forEach(handler => handler(message));
      return;
    }

    if (message.type === 'response') {
      this.responseListeners.get(message.id)?.(message);
    }
  }

  async openSettings(): Promise<void> {
    if (this.nativeBridge.openSettings) {
      await this.nativeBridge.openSettings();
      return;
    }
    await this.send('openSettings', {});
  }

  async setRuntimeParameter(key: string, value: string): Promise<void> {
    if (this.nativeBridge.setRuntimeParameter) {
      await this.nativeBridge.setRuntimeParameter(key, value);
      return;
    }
    await this.send('setRuntimeParameter', { key, value });
  }

  async requestStatus(): Promise<unknown> {
    if (this.nativeBridge.requestStatus) return await this.nativeBridge.requestStatus();
    const response = await this.request('requestStatus', {});
    return response.payload;
  }

  async syncNow(): Promise<void> {
    if (this.nativeBridge.syncNow) {
      await this.nativeBridge.syncNow();
      return;
    }
    await this.send('syncNow', {});
  }

  private waitForResponse<TResponse>(id: string, timeoutMs: number): Promise<BridgeResponse<TResponse>> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.responseListeners.delete(id);
        reject(new Error(`Timeout esperando respuesta del bridge (${timeoutMs} ms).`));
      }, timeoutMs);

      this.responseListeners.set(id, response => {
        window.clearTimeout(timer);
        this.responseListeners.delete(id);
        resolve(response as BridgeResponse<TResponse>);
      });
    });
  }
}

export function createAndrewBridgeClient(nativeBridge?: AndrewBridgeNative): AndrewBridgeClient {
  return new AndrewBridgeClient(nativeBridge);
}
