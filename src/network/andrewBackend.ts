import { FetchNetworkAdapter, type NetworkRequestInput } from './network-adapter';

export type AndrewMemoryContext = string;
export interface AndrewAttachment { type: 'image' | 'video'; name: string; mimeType: string; dataUrl?: string; uploadId?: string; size?: number; }
export interface AndrewChatRequest { message: string; conversationId: string; memory?: AndrewMemoryContext[]; attachment?: AndrewAttachment; }
export interface AndrewChatResponse { ok: true; conversationId: string; reply: string; responseId: string | null; model: string; learning: { eligible: boolean; source: string }; }
export interface AndrewChatError { ok: false; error: string; message?: string; }
export type NetworkStatus = 'connecting' | 'retrying' | 'connected' | 'error';
export type NetworkStatusListener = (status: NetworkStatus, detail?: string) => void;

const DEFAULT_TIMEOUT_MS = 65000;
const HEALTH_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BACKOFF_MS = 900;
const VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;
const VIDEO_CHUNK_RETRIES = 4;
const USER_ID_STORAGE_KEY = 'andrew:user-id';
const USER_NAME_STORAGE_KEY = 'andrew:user-name';
const MEMORY_STORAGE_KEY = 'andrew:memory:v1';
const CHAT_STORAGE_KEY = 'andrew:ui:chat:v2';
const BACKEND_NETWORK_CAPABILITY = 'public-web' as const;
const networkAdapter = new FetchNetworkAdapter({ fetchImpl: (input: NetworkRequestInput, init) => fetch(input, init) });

function createSafeId(prefix: string): string {
  try {
    const random = globalThis.crypto?.randomUUID?.();
    if (random) return `${prefix}${random}`;
  } catch { /* Android WebView compatibility. */ }
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    const entropy = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    if (entropy) return `${prefix}${Date.now().toString(36)}-${entropy}`;
  } catch { /* Fall through. */ }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function getBackendUrl(): string {
  const configured = (import.meta.env['VITE_ANDREW_BACKEND_URL'] || 'https://andrew2-api.onrender.com').trim();
  return configured.replace(/\/$/, '');
}

function getAndrewUserId(): string {
  try {
    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY)?.trim();
    if (existing && /^[A-Za-z0-9._:-]{1,128}$/.test(existing)) return existing;
    const generated = createSafeId('user:');
    window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
    return generated;
  } catch { return createSafeId('session:'); }
}

function readStoredMemory(): string[] {
  try {
    const raw = window.localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(-20);
  } catch { return []; }
}

function writeStoredMemory(values: string[]): void {
  try { window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(values.slice(-50))); } catch { /* Optional local persistence. */ }
}

function extractExplicitMemory(message: string): string[] {
  const facts: string[] = [];
  const normalized = message.trim();
  const nameMatch = normalized.match(/\bmi nombre es\s+([^.!?\n]{1,80})/i);
  if (nameMatch?.[1]) {
    const name = nameMatch[1].trim().replace(/\s+/g, ' ');
    if (name) {
      try { window.localStorage.setItem(USER_NAME_STORAGE_KEY, name); } catch { /* Optional. */ }
      facts.push(`El nombre del usuario es ${name}.`);
    }
  }
  const rememberMatch = normalized.match(/\b(?:recuerda|recordar|guarda|guardar)\s+(?:que\s+)?(.{3,240})$/i);
  if (rememberMatch?.[1]) facts.push(`El usuario pidió recordar: ${rememberMatch[1].trim()}`);
  return facts;
}

function buildLocalMemory(currentMessage: string, supplied: AndrewMemoryContext[] | undefined): string[] {
  const explicit = extractExplicitMemory(currentMessage);
  const stored = readStoredMemory();
  const userName = (() => { try { return window.localStorage.getItem(USER_NAME_STORAGE_KEY)?.trim() || ''; } catch { return ''; } })();
  const identity = userName ? [`El nombre del usuario es ${userName}.`] : [];
  let chat: string[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHAT_STORAGE_KEY) || '[]') as unknown;
    if (Array.isArray(parsed)) chat = parsed.slice(-12).filter((item): item is { role: string; content: string } => Boolean(item && typeof item === 'object' && typeof (item as { role?: unknown }).role === 'string' && typeof (item as { content?: unknown }).content === 'string')).map(item => `${item.role === 'user' ? 'Usuario' : 'Andrew'}: ${item.content}`).slice(-12);
  } catch { /* Optional local history. */ }
  if (explicit.length) writeStoredMemory([...stored, ...explicit]);
  return [...new Set([...identity, ...readStoredMemory(), ...(supplied || []), ...chat])].slice(-30);
}

function sleep(ms: number): Promise<void> { return new Promise(resolve => window.setTimeout(resolve, ms)); }
function notify(listener: NetworkStatusListener | undefined, status: NetworkStatus, detail?: string): void {
  listener?.(status, detail);
  try { window.dispatchEvent(new CustomEvent('andrew:network-status', { detail: { status, detail } })); } catch { /* Optional UI event. */ }
}
function isRetryableError(error: unknown): boolean { return error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError'); }

async function fetchWithRetry(input: NetworkRequestInput, init: RequestInit, timeoutMs: number, listener?: NetworkStatusListener, attempts = MAX_RETRIES): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (attempt === 0) notify(listener, 'connecting'); else notify(listener, 'retrying', `Reintentando conexión (${attempt + 1}/${attempts + 1})`);
    try {
      const { response } = await networkAdapter.request({ capability: BACKEND_NETWORK_CAPABILITY, input, init, timeoutMs });
      if (response.ok) notify(listener, 'connected');
      const retryableStatus = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryableStatus || attempt === attempts) return response;
      await sleep(BACKOFF_MS * (2 ** attempt));
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) { notify(listener, 'error', error instanceof Error ? error.message : 'Error de red'); throw error; }
      await sleep(BACKOFF_MS * (2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No fue posible conectar con Andrew.');
}

function parseError(data: unknown, fallback: string): Error {
  if (data && typeof data === 'object') {
    const value = data as { message?: unknown; error?: unknown };
    if (typeof value.message === 'string' && value.message.trim()) return new Error(value.message);
    if (typeof value.error === 'string' && value.error.trim()) return new Error(value.error);
  }
  return new Error(fallback);
}
function haptic(duration = 12): void { try { if ('vibrate' in navigator) navigator.vibrate(duration); } catch { /* Optional. */ } }

async function uploadChunk(base: string, uploadId: string, fileSize: number, start: number, end: number, chunk: ArrayBuffer, listener?: NetworkStatusListener): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < VIDEO_CHUNK_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithRetry(`${base}/api/media/video/${uploadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-Start': String(start), 'X-Chunk-End': String(end), 'X-Upload-Size': String(fileSize) }, body: chunk }, 65000, listener, 0);
      const data = await response.json().catch(() => ({})) as { ok: boolean; received?: number; error?: string; message?: string };
      if (!response.ok || !data.ok || data.received !== end) throw parseError(data, `Falló el fragmento ${start}-${end}.`);
      return data.received;
    } catch (error) {
      lastError = error;
      if (attempt === VIDEO_CHUNK_RETRIES - 1) throw error;
      notify(listener, 'retrying', `Reintentando fragmento ${start}-${end} (${attempt + 2}/${VIDEO_CHUNK_RETRIES})`);
      await sleep(600 * (2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Falló la carga del fragmento.');
}

export async function uploadVideoInChunks(file: File, onProgress?: (percent: number) => void, onNetworkStatus?: NetworkStatusListener): Promise<AndrewAttachment> {
  const base = getBackendUrl();
  if (!file.type.startsWith('video/')) throw new Error('El archivo seleccionado no es un video.');
  if (file.size > 250 * 1024 * 1024) throw new Error('El video supera el máximo de 250 MB.');
  const initResponse = await fetchWithRetry(`${base}/api/media/video/init`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Andrew-User-Id': getAndrewUserId() }, body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, chunkSize: VIDEO_CHUNK_BYTES }) }, 65000, onNetworkStatus);
  const init = await initResponse.json().catch(() => ({})) as { ok: boolean; uploadId?: string; chunkSize?: number; error?: string; message?: string };
  if (!initResponse.ok || !init.ok || !init.uploadId) throw parseError(init, 'No fue posible iniciar la carga del video.');
  const chunkSize = init.chunkSize || VIDEO_CHUNK_BYTES;
  let received = 0;
  while (received < file.size) {
    const start = received; const end = Math.min(received + chunkSize, file.size);
    received = await uploadChunk(base, init.uploadId, file.size, start, end, await file.slice(start, end).arrayBuffer(), onNetworkStatus);
    const progress = Math.round((received / file.size) * 100); onProgress?.(progress);
    if (progress % 10 === 0 || progress === 100) haptic(progress === 100 ? 28 : 10);
  }
  notify(onNetworkStatus, 'connected');
  return { type: 'video', name: file.name, mimeType: file.type, uploadId: init.uploadId, size: file.size };
}

export async function sendAndrewMessage(request: AndrewChatRequest, timeoutMs = DEFAULT_TIMEOUT_MS, onNetworkStatus?: NetworkStatusListener): Promise<AndrewChatResponse> {
  const message = request.message.trim();
  const memory = buildLocalMemory(message, request.memory);
  const response = await fetchWithRetry(`${getBackendUrl()}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Andrew-User-Id': getAndrewUserId() }, body: JSON.stringify({ message, conversationId: request.conversationId, memory: memory.slice(0, 30), attachment: request.attachment }) }, Math.max(timeoutMs, 60000), onNetworkStatus);
  const data = await response.json().catch(() => ({})) as AndrewChatResponse | AndrewChatError;
  if (!response.ok || !data.ok) throw parseError(data, `Andrew backend HTTP ${response.status}`);
  notify(onNetworkStatus, 'connected'); return data;
}

export async function checkAndrewBackend(onNetworkStatus?: NetworkStatusListener): Promise<boolean> {
  try { const response = await fetchWithRetry(`${getBackendUrl()}/health`, { method: 'GET', headers: { Accept: 'application/json' } }, HEALTH_TIMEOUT_MS, onNetworkStatus, 1); return response.ok; }
  catch { notify(onNetworkStatus, 'error', 'Backend no disponible'); return false; }
}
