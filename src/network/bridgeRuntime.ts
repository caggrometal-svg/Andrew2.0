export type BridgeRuntimeStatus = 'online' | 'offline' | 'syncing';

export interface BridgeRuntimeEvent {
  readonly type: 'status' | 'agent';
  readonly status?: BridgeRuntimeStatus;
  readonly runId?: string;
  readonly phase?: string;
  readonly payload?: unknown;
  readonly timestamp: number;
}

type Listener = (event: BridgeRuntimeEvent) => void;

const QUEUE_KEY = 'andrew:bridge-queue-v1';
const MAX_QUEUE = 50;

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export class BridgeRuntime {
  private readonly listeners = new Set<Listener>();
  private status: BridgeRuntimeStatus = 'offline';
  private queue: string[] = [];

  constructor() {
    const raw = store()?.getItem(QUEUE_KEY);
    if (raw) {
      try { this.queue = JSON.parse(raw) as string[]; } catch { this.queue = []; }
    }
  }

  getStatus(): BridgeRuntimeStatus { return this.status; }
  getQueueSize(): number { return this.queue.length; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setStatus(status: BridgeRuntimeStatus): void {
    this.status = status;
    this.emit({ type: 'status', status, timestamp: Date.now() });
  }

  enqueue(message: string): boolean {
    const value = message.trim();
    if (!value || this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(value);
    this.persist();
    return true;
  }

  drain(): string[] {
    const pending = [...this.queue];
    this.queue = [];
    this.persist();
    return pending;
  }

  publishAgentEvent(runId: string, phase: string, payload?: unknown): void {
    this.emit({ type: 'agent', runId, phase, payload, timestamp: Date.now() });
  }

  private persist(): void {
    try { store()?.setItem(QUEUE_KEY, JSON.stringify(this.queue)); } catch { /* best effort */ }
  }

  private emit(event: BridgeRuntimeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const bridgeRuntime = new BridgeRuntime();
