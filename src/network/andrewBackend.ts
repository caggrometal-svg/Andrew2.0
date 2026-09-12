import { FetchNetworkAdapter } from './network-adapter';

export type AndrewMemoryContext = string;

export interface AndrewAttachment {
  type: 'image' | 'video';
  name: string;
  mimeType: string;
  dataUrl?: string;
  uploadId?: string;
  size?: number;
}

export interface AndrewChatRequest {
  message: string;
  conversationId: string;
  memory?: AndrewMemoryContext[];
  attachment?: AndrewAttachment;
}

export interface AndrewChatResponse {
  ok: true;
  conversationId: string;
  reply: string;
  responseId: string | null;
  model: string;
  learning: { eligible: boolean; source: string };
}

export interface AndrewChatError {
  ok: false;
  error: string;
  message?: string;
}

export type NetworkStatus = 'connecting' | 'retrying' | 'connected' | 'error';
export type NetworkStatusListener = (status: NetworkStatus, detail?: string) => void;

const DEFAULT_TIMEOUT_MS = 65000;
const HEALTH_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BACKOFF_MS = 900;
const VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;
const VIDEO_CHUNK_RETRIES = 4;
const USER_ID_STORAGE_KEY = 'andrew:user-id';
const BACKEND_NETWORK_CAPABILITY = 'public-web' as const;

const networkAdapter = new FetchNetworkAdapter({ fetchImpl: (input, init) => fetch(input, init) });

function getBackendUrl(): string {
  const configured = (import.meta.env['VITE_ANDREW_BACKEND_URL'] || 'https://andrew2-api.onrender.com').trim();
  return configured.replace(/\/$/, '');
}

function getAndrewUserId(): string {
  try {
    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY)?.trim();
    if (existing && /^[A-Za-z0-9._:-]{1,128}$/.test(existing)) return existing;
    const generated = `user:${crypto.randomUUID()}`;
    window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `session:${crypto.randomUUID()}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function notify(listener: NetworkStatusListener | undefined, status: NetworkStatus, detail?: string): void {
  listener?.(status, detail);
  window.dispatchEvent(new CustomEvent('andrew:network-status', { detail: { status, detail } }));
  const live = document.querySelector<HTMLElement>('[aria-live="polite"]');
  if (live) live.textContent = status === 'connecting' ? 'Conectando…' : status === 'retrying' ? (detail || 'Reintentando…') : status === 'error' ? 'Conexión interrumpida' : 'Conexión establecida';
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return false;
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, listener?: NetworkStatusListener, attempts = MAX_RETRIES): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (attempt === 0) notify(listener, 'connecting');
    else notify(listener, 'retrying', `Reintentando conexión (${attempt + 1}/${attempts + 1})`);
    try {
      const { response } = await networkAdapter.request({
        capability: BACKEND_NETWORK_CAPABILITY,
        input,
        init,
        timeoutMs,
      });
      if (response.ok) notify(listener, 'connected');
      const retryableStatus = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryableStatus || attempt === attempts) return response;
      await sleep(BACKOFF_MS * (2 ** attempt));
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) {
        notify(listener, 'error', error instanceof Error ? error.message : 'Error de red');
        throw error;
      }
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

function haptic(duration = 12): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(duration);
  } catch {
    // Haptics are optional and unavailable in some Android WebViews.
  }
}

async function uploadChunk(base: string, uploadId: string, fileSize: number, start: number, end: number, chunk: ArrayBuffer, listener?: NetworkStatusListener): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < VIDEO_CHUNK_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithRetry(`${base}/api/media/video/${uploadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Chunk-Start': String(start),
          'X-Chunk-End': String(end),
          'X-Upload-Size': String(fileSize),
        },
        body: chunk,
      }, 65000, listener, 0);
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

  const initResponse = await fetchWithRetry(`${base}/api/media/video/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Andrew-User-Id': getAndrewUserId() },
    body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, chunkSize: VIDEO_CHUNK_BYTES }),
  }, 65000, onNetworkStatus);
  const init = await initResponse.json().catch(() => ({})) as { ok: boolean; uploadId?: string; chunkSize?: number; error?: string; message?: string };
  if (!initResponse.ok || !init.ok || !init.uploadId) throw parseError(init, 'No fue posible iniciar la carga del video.');

  const chunkSize = init.chunkSize || VIDEO_CHUNK_BYTES;
  let received = 0;
  while (received < file.size) {
    const start = received;
    const end = Math.min(received + chunkSize, file.size);
    const chunk = await file.slice(start, end).arrayBuffer();
    received = await uploadChunk(base, init.uploadId, file.size, start, end, chunk, onNetworkStatus);
    const progress = Math.round((received / file.size) * 100);
    onProgress?.(progress);
    if (progress % 10 === 0 || progress === 100) haptic(progress === 100 ? 28 : 10);
  }

  notify(onNetworkStatus, 'connected');
  return { type: 'video', name: file.name, mimeType: file.type, uploadId: init.uploadId, size: file.size };
}

export async function sendAndrewMessage(request: AndrewChatRequest, timeoutMs = DEFAULT_TIMEOUT_MS, onNetworkStatus?: NetworkStatusListener): Promise<AndrewChatResponse> {
  const response = await fetchWithRetry(`${getBackendUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Andrew-User-Id': getAndrewUserId() },
    body: JSON.stringify({ message: request.message.trim(), conversationId: request.conversationId, memory: request.memory?.slice(0, 20), attachment: request.attachment }),
  }, Math.max(timeoutMs, 60000), onNetworkStatus);
  const data = await response.json().catch(() => ({})) as AndrewChatResponse | AndrewChatError;
  if (!response.ok || !data.ok) throw parseError(data, `Andrew backend HTTP ${response.status}`);
  notify(onNetworkStatus, 'connected');
  return data;
}

export async function checkAndrewBackend(onNetworkStatus?: NetworkStatusListener): Promise<boolean> {
  try {
    const response = await fetchWithRetry(`${getBackendUrl()}/health`, { method: 'GET', headers: { Accept: 'application/json' } }, HEALTH_TIMEOUT_MS, onNetworkStatus, 1);
    return response.ok;
  } catch {
    notify(onNetworkStatus, 'error', 'Backend no disponible');
    return false;
  }
}
