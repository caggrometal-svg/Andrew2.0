export type AndroidBridgeCommand =
  | 'open_settings'
  | 'set_runtime_parameter'
  | 'request_status'
  | 'sync_now';

export type AndroidBridgeCommandEnvelope = {
  id: string;
  command: AndroidBridgeCommand;
  payload?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
};

export type AndroidBridgeAck = {
  id: string;
  ok: boolean;
  error?: 'expired' | 'unsupported' | 'invalid_payload';
  acknowledgedAt: number;
};

const QUEUE_KEY = 'andrew.android.bridge.v3.commands';
const ACK_KEY = 'andrew.android.bridge.v3.acks';
const MAX_QUEUE = 100;
const MAX_ACKS = 100;
const TTL_MS = 5 * 60 * 1000;

const ALLOWED_COMMANDS = new Set<AndroidBridgeCommand>([
  'open_settings',
  'set_runtime_parameter',
  'request_status',
  'sync_now',
]);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function prune<T extends { createdAt: number }>(items: T[], max: number): T[] {
  return items.filter(item => item.createdAt + TTL_MS > Date.now()).slice(-max);
}

export class AndroidBridgeV3 {
  createCommand(command: AndroidBridgeCommand, payload?: Record<string, unknown>): AndroidBridgeCommandEnvelope {
    if (!ALLOWED_COMMANDS.has(command)) throw new Error('unsupported');
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      command,
      payload,
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
    };
  }

  enqueue(command: AndroidBridgeCommand, payload?: Record<string, unknown>): AndroidBridgeCommandEnvelope {
    const envelope = this.createCommand(command, payload);
    const queue = prune(readJson<AndroidBridgeCommandEnvelope[]>(QUEUE_KEY, []), MAX_QUEUE);
    writeJson(QUEUE_KEY, [...queue, envelope].slice(-MAX_QUEUE));
    return envelope;
  }

  pending(): AndroidBridgeCommandEnvelope[] {
    const queue = prune(readJson<AndroidBridgeCommandEnvelope[]>(QUEUE_KEY, []), MAX_QUEUE);
    writeJson(QUEUE_KEY, queue);
    return queue;
  }

  acknowledge(id: string, ok: boolean, error?: AndroidBridgeAck['error']): AndroidBridgeAck {
    const ack: AndroidBridgeAck = { id, ok, error, acknowledgedAt: Date.now() };
    const existing = readJson<AndroidBridgeAck[]>(ACK_KEY, []);
    writeJson(ACK_KEY, [...existing, ack].slice(-MAX_ACKS));
    writeJson(QUEUE_KEY, this.pending().filter(command => command.id !== id));
    return ack;
  }

  drain(): AndroidBridgeCommandEnvelope[] {
    const queue = this.pending();
    writeJson(QUEUE_KEY, []);
    return queue;
  }

  acks(): AndroidBridgeAck[] {
    return readJson<AndroidBridgeAck[]>(ACK_KEY, []).slice(-MAX_ACKS);
  }
}

export const androidBridgeV3 = new AndroidBridgeV3();
