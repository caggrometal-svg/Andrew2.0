import { getBridgeUserId } from './andrewBridge';

const DEFAULT_BACKEND = 'https://andrew2-api.onrender.com';
const POLL_MS = 5000;

type BridgeCommand = {
  id: string;
  command: 'open_settings' | 'set_runtime_parameter' | 'request_status' | 'sync_now';
  payload?: { key?: string; value?: string | number | boolean; section?: string };
  expiresAt: number;
};

type CommandResponse = { ok: true; commands: BridgeCommand[] };
type AckResponse = { ok: true; id: string; acknowledgedAt: number };

type NativeBridge = {
  openSettings?: () => void;
  setRuntimeParameter?: (key: string, value: string) => void;
  requestStatus?: () => string;
  syncNow?: () => void;
};

declare global {
  interface Window { AndrewBridge?: NativeBridge; }
}

function backendUrl(): string {
  return (import.meta.env['VITE_ANDREW_BACKEND_URL'] || DEFAULT_BACKEND).trim().replace(/\/$/, '');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backendUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      'X-Andrew-User-Id': getBridgeUserId(),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => null) as T | null;
  if (!response.ok || !data) throw new Error(`Bridge HTTP ${response.status}`);
  return data;
}

function execute(command: BridgeCommand): void {
  const native = window.AndrewBridge;
  if (!native) throw new Error('native_bridge_unavailable');
  switch (command.command) {
    case 'open_settings':
      if (!native.openSettings) throw new Error('native_operation_unavailable');
      native.openSettings();
      return;
    case 'set_runtime_parameter': {
      const key = command.payload?.key;
      const value = command.payload?.value;
      if (typeof key !== 'string' || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) throw new Error('invalid_runtime_payload');
      if (!native.setRuntimeParameter) throw new Error('native_operation_unavailable');
      native.setRuntimeParameter(key, String(value));
      return;
    }
    case 'request_status':
      if (!native.requestStatus) throw new Error('native_operation_unavailable');
      native.requestStatus();
      return;
    case 'sync_now':
      if (!native.syncNow) throw new Error('native_operation_unavailable');
      native.syncNow();
      return;
  }
}

export function startBridgeCommandLoop(onError?: (error: Error) => void): () => void {
  let stopped = false;
  let polling = false;

  const poll = async () => {
    if (stopped || polling || !window.AndrewBridge) return;
    polling = true;
    try {
      const data = await request<CommandResponse>('/api/v1/bridge/v3/commands');
      for (const command of data.commands) {
        if (Date.now() > command.expiresAt) continue;
        try {
          execute(command);
          await request<AckResponse>('/api/v1/bridge/v3/ack', { method: 'POST', body: JSON.stringify({ id: command.id, ok: true }) });
        } catch (error) {
          await request<AckResponse>('/api/v1/bridge/v3/ack', { method: 'POST', body: JSON.stringify({ id: command.id, ok: false, error: error instanceof Error && error.message === 'invalid_runtime_payload' ? 'invalid_payload' : 'unsupported' }) }).catch(() => undefined);
          throw error;
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      polling = false;
    }
  };

  void poll();
  const timer = window.setInterval(() => void poll(), POLL_MS);
  return () => { stopped = true; window.clearInterval(timer); };
}
