const STORAGE_USER_KEY = 'andrew:device-user-id';
const STORAGE_SESSION_KEY = 'andrew:gateway-session-id';
const DEFAULT_BACKEND = 'https://andrew2-api.onrender.com';

export interface BridgeResponse {
  readonly ok: true;
  readonly sessionId: string;
  readonly reply: string;
  readonly responseId: string | null;
  readonly model: string;
}

interface ChatResponse { ok: true; conversationId: string; reply: string; responseId: string | null; model: string }
type GatewayError = { message?: unknown; error?: unknown };

function backendUrl(): string {
  return (import.meta.env['VITE_ANDREW_BACKEND_URL'] || DEFAULT_BACKEND).trim().replace(/\/$/, '');
}

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function persistentId(key: string, prefix: string): string {
  const store = storage();
  const existing = store?.getItem(key);
  if (existing) return existing;
  const value = `${prefix}-${crypto.randomUUID()}`;
  store?.setItem(key, value);
  return value;
}

export function getBridgeUserId(): string { return persistentId(STORAGE_USER_KEY, 'device'); }
export function getBridgeSessionId(): string { return persistentId(STORAGE_SESSION_KEY, 'session'); }

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
  const data = await response.json().catch(() => null) as (T & GatewayError) | null;
  if (!response.ok || !data) {
    const detail = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : `Gateway HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function ensureBridgeSession(sessionId = getBridgeSessionId()): Promise<string> {
  return sessionId;
}

export async function sendThroughBridge(message: string, sessionId = getBridgeSessionId()): Promise<BridgeResponse> {
  const normalized = message.trim();
  if (!normalized) throw new Error('El mensaje está vacío.');
  const data = await request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: normalized, conversationId: sessionId }),
  });
  return { ok: true, sessionId: data.conversationId, reply: data.reply, responseId: data.responseId, model: data.model };
}
