import type {
  AndrewBridgeNative,
  BridgeCommand,
  BridgeEvent,
  BridgeMessage,
  BridgeResponse,
  RuntimeParameterKey,
  RuntimeParameterValue,
  RuntimeStatusPayload,
} from './types';

export type BridgeEventHandler<TPayload = unknown> = (event: BridgeEvent<TPayload>) => void;
export interface BridgeRequestOptions { readonly timeoutMs?: number; }
const DEFAULT_TIMEOUT_MS = 10000;

function bridge(): AndrewBridgeNative {
  if (!window.AndrewBridge) throw new Error('AndrewBridge no está disponible en el entorno nativo.');
  return window.AndrewBridge;
}

function createId(): string { return `bridge-${crypto.randomUUID()}`; }

function createCommand<TPayload>(method: string, payload: TPayload): BridgeCommand<TPayload> {
  return { id: createId(), type: 'command', method, payload, timestamp: Date.now(), version: '1' };
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function parseNativeStatus(status: unknown): RuntimeStatusPayload {
  const parsed = typeof status === 'string' ? parseJson(status) : status;
  if (!parsed || typeof parsed !== 'object') return {};
  const record = parsed as Record<string, unknown>;
  const runtimeValue = record['runtime'];
  const runtime = typeof runtimeValue === 'string' ? parseJson(runtimeValue) : runtimeValue;
  if (runtime && typeof runtime === 'object') {
    return { ...(record as RuntimeStatusPayload), ...(runtime as Partial<RuntimeStatusPayload>) };
  }
  return record as RuntimeStatusPayload;
}

export class AndrewBridgeClient {
  private readonly listeners = new Map<string, Set<BridgeEventHandler>>();
  private readonly responseListeners = new Map<string, (response: BridgeResponse) => void>();

  constructor(private readonly nativeBridge: AndrewBridgeNative = bridge()) {}

  async send<TPayload = unknown>(method: string, payload: TPayload = {} as TPayload): Promise<void> {
    if (!this.nativeBridge.send) throw new Error(`AndrewBridge no expone send() para ${method}.`);
    await this.nativeBridge.send(createCommand(method, payload));
  }

  async request<TPayload = unknown, TResponse = unknown>(method: string, payload: TPayload = {} as TPayload, options: BridgeRequestOptions = {}): Promise<BridgeResponse<TResponse>> {
    const command = createCommand(method, payload);
    if (this.nativeBridge.request) return await this.nativeBridge.request(command) as BridgeResponse<TResponse>;
    if (!this.nativeBridge.send) throw new Error(`AndrewBridge no expone request() ni send() para ${method}.`);
    const responsePromise = this.waitForResponse<TResponse>(command.id, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    await this.nativeBridge.send(command);
    return await responsePromise;
  }

  on<TPayload = unknown>(method: string, handler: BridgeEventHandler<TPayload>): () => void {
    const handlers = this.listeners.get(method) ?? new Set<BridgeEventHandler>();
    handlers.add(handler as BridgeEventHandler);
    this.listeners.set(method, handlers);
    return () => { handlers.delete(handler as BridgeEventHandler); if (!handlers.size) this.listeners.delete(method); };
  }

  handleMessage(message: BridgeMessage): void {
    if (message.type === 'event') this.listeners.get(message.method)?.forEach(handler => handler(message));
    if (message.type === 'response') this.responseListeners.get(message.id)?.(message);
  }

  async openSettings(): Promise<void> {
    if (this.nativeBridge.openSettings) return await this.nativeBridge.openSettings();
    await this.send('openSettings', {});
  }

  async setRuntimeParameter(key: RuntimeParameterKey, value: RuntimeParameterValue): Promise<void> {
    const serialized = String(value);
    if (this.nativeBridge.setRuntimeParameter) return await this.nativeBridge.setRuntimeParameter(key, serialized);
    await this.send('setRuntimeParameter', { key, value: serialized });
  }

  async requestStatus(): Promise<RuntimeStatusPayload> {
    if (this.nativeBridge.requestStatus) return parseNativeStatus(await this.nativeBridge.requestStatus());
    const response = await this.request('requestStatus', {});
    return parseNativeStatus(response.payload);
  }

  async syncNow(): Promise<void> {
    if (this.nativeBridge.syncNow) return await this.nativeBridge.syncNow();
    await this.send('syncNow', {});
  }

  private waitForResponse<TResponse>(id: string, timeoutMs: number): Promise<BridgeResponse<TResponse>> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.responseListeners.delete(id); reject(new Error(`Timeout esperando respuesta del bridge (${timeoutMs} ms).`)); }, timeoutMs);
      this.responseListeners.set(id, response => { window.clearTimeout(timer); this.responseListeners.delete(id); resolve(response as BridgeResponse<TResponse>); });
    });
  }
}

export function createAndrewBridgeClient(nativeBridge?: AndrewBridgeNative): AndrewBridgeClient { return new AndrewBridgeClient(nativeBridge); }
