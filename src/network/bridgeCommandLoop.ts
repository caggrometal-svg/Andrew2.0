import { getBridgeUserId } from './andrewBridge';
import type { AndrewBridgeNative } from '../bridge/types';

const DEFAULT_BACKEND = 'https://andrew2-api.onrender.com';
const POLL_MS = 5000;

type BridgeCommand = {
  id: string;
  command: 'open_settings' | 'set_runtime_parameter' | 'request_status' | 'sync_now';
  payload?: { key?: string; value?: string | number | boolean; section?: string };
  expiresAt: number;
};

type CommandResponse = { ok: true; commands: BridgeCommand[] };
type ResultResponse = { ok: true; id: string; acknowledgedAt: number; result: unknown | null };
type AIResponse = { ok: true; reply: string; provider?: string; model?: string; latencyMs?: number };

type BridgeLoopResult = {
  commandId: string;
  command: BridgeCommand['command'];
  result: unknown | null;
  reply?: string;
};

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

async function execute(command: BridgeCommand): Promise<unknown> {
  const native: AndrewBridgeNative | undefined = window.AndrewBridge;
  if (!native) throw new Error('native_bridge_unavailable');
  switch (command.command) {
    case 'open_settings':
      if (!native.openSettings) throw new Error('native_operation_unavailable');
      await native.openSettings();
      return null;
    case 'set_runtime_parameter': {
      const key = command.payload?.key;
      const value = command.payload?.value;
      if (typeof key !== 'string' || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) throw new Error('invalid_runtime_payload');
      if (!native.setRuntimeParameter) throw new Error('native_operation_unavailable');
      await native.setRuntimeParameter(key, String(value));
      return { key, value: String(value) };
    }
    case 'request_status':
      if (!native.requestStatus) throw new Error('native_operation_unavailable');
      return await native.requestStatus();
    case 'sync_now':
      if (!native.syncNow) throw new Error('native_operation_unavailable');
      await native.syncNow();
      return { syncedAt: Date.now() };
  }
}

async function sendResultToAI(command: BridgeCommand, result: unknown): Promise<string | undefined> {
  const message = `Bridge ${command.command} result: ${JSON.stringify(result)}. Explain what happened briefly.`;
  const response = await request<AIResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId: `bridge:${getBridgeUserId()}` }),
  });
  return response.reply;
}

export function startBridgeCommandLoop(onError?: (error: Error) => void, onResult?: (result: BridgeLoopResult) => void): () => void {
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
          const result = await execute(command);
          const response = await request<ResultResponse>('/api/v1/bridge/v3/result', {
            method: 'POST',
            body: JSON.stringify({ id: command.id, command: command.command, ok: true, result }),
          });
          const reply = response.result === null ? undefined : await sendResultToAI(command, response.result);
          const loopResult: BridgeLoopResult = { commandId: command.id, command: command.command, result: response.result };
          if (reply !== undefined) loopResult.reply = reply;
          onResult?.(loopResult);
        } catch (error) {
          await request<ResultResponse>('/api/v1/bridge/v3/result', {
            method: 'POST',
            body: JSON.stringify({ id: command.id, command: command.command, ok: false, error: error instanceof Error && error.message === 'invalid_runtime_payload' ? 'invalid_payload' : 'unsupported' }),
          }).catch(() => undefined);
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
