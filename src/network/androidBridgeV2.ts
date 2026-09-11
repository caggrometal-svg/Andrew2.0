export type AndroidBridgeStatus = 'online' | 'offline' | 'syncing';

export type AndroidBridgeEvent = {
  id: string;
  type: string;
  payload?: unknown;
  createdAt: number;
};

const QUEUE_KEY = 'andrew.android.bridge.v2.queue';
const MAX_QUEUE = 100;

function loadQueue(): AndroidBridgeEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: AndroidBridgeEvent[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

export class AndroidBridgeV2 {
  private status: AndroidBridgeStatus = 'offline';
  private listeners = new Set<(status: AndroidBridgeStatus) => void>();
  private eventListeners = new Set<(event: AndroidBridgeEvent) => void>();

  getStatus(): AndroidBridgeStatus { return this.status; }

  subscribe(listener: (status: AndroidBridgeStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEvent(listener: (event: AndroidBridgeEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  setStatus(status: AndroidBridgeStatus): void {
    this.status = status;
    this.listeners.forEach(listener => listener(status));
  }

  publish(type: string, payload?: unknown): AndroidBridgeEvent {
    const event: AndroidBridgeEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      type,
      payload,
      createdAt: Date.now(),
    };
    if (this.status !== 'online') {
      saveQueue([...loadQueue(), event]);
    }
    this.eventListeners.forEach(listener => listener(event));
    return event;
  }

  pending(): AndroidBridgeEvent[] { return loadQueue(); }

  drain(): AndroidBridgeEvent[] {
    const queue = loadQueue();
    saveQueue([]);
    return queue;
  }
}

export const androidBridgeV2 = new AndroidBridgeV2();
