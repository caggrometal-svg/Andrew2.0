const STORAGE_USER_KEY = 'andrew:device-user-id';
const STORAGE_SESSION_KEY = 'andrew:gateway-session-id';
const DEFAULT_BACKEND = 'https://andrew2-api.onrender.com';

export interface BridgeMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface BridgeResponse {
  readonly ok: true;
  readonly sessionId: string;
  readonly reply: string;
  readonly responseId: string | null;
  readonly model: string;
}

interface SessionResponse { ok: true; session: { sessionId: string }; }
interface MessageResponse { ok: true; sessionId: string; message: { content?: string }; responseId: string | null; model: string; }

function backendUrl(): string {
  return (import.meta.env.VITE_ANDREW_BACKEND_URL || DEFAULT_BACKEND).trim().replace(/\/$/, '');
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

export function getBridgeUserId(): string {
  return persistentId(STORAGE_USER_KEY, 'device');
}

export function getBridgeSessionId(): string {
  return persistentId(STORAGE_SESSION_KEY, 'session');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${backendUrl()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), 'X-Andrew-User-Id': getBridgeUserId(), ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null) as (T & { message?: string; error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.message || data?.error || `Gateway HTTP ${response.status}`);
  return data;
}

export async function ensureBridgeSession(): Promise<string> {
  const sessionId = getBridgeSessionId();
  const existing = await request<{ ok: boolean; session?: unknown }>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
  if (existing.ok && existing.session) return sessionId;
  throw new Error('SESSION_NOT_FOUND');
}

export async function createBridgeSession(): Promise<string> {
  const sessionId = getBridgeSessionId();
  const data = await request<SessionResponse>('/api/v1/sessions', { method: 'POST', body: JSON.stringify({ sessionId, title: 'Andrew 2.0' }) });
  return data.session.sessionId;
}

export async function sendThroughBridge(message: string): Promise<BridgeResponse> {
  const normalized = message.trim();
  if (!normalized) throw new Error('El mensaje está vacío.');
  const sessionId = getBridgeSessionId();
  let ready = false;
  try { ready = await request<{ ok: boolean; session?: unknown }>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`).then(data => data.ok && Boolean(data.session)); } catch { ready = false; }
  if (!ready) await createBridgeSession();
  const data = await request<MessageResponse>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`, { method: 'POST', body: JSON.stringify({ message: normalized }) });
  return { ok: true, sessionId: data.sessionId, reply: data.message.content || '', responseId: data.responseId, model: data.model };
}
