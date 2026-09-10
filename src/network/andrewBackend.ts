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

const DEFAULT_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const BACKOFF_MS = 700;
const VIDEO_CHUNK_BYTES = 2 * 1024 * 1024;

function getBackendUrl(): string {
  const configured = (import.meta.env.VITE_ANDREW_BACKEND_URL || 'https://andrew2-api.onrender.com').trim();
  return configured.replace(/\/$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function uploadVideoInChunks(file: File, onProgress?: (percent: number) => void): Promise<AndrewAttachment> {
  const base = getBackendUrl();
  if (!file.type.startsWith('video/')) throw new Error('El archivo seleccionado no es un video.');
  if (file.size > 250 * 1024 * 1024) throw new Error('El video supera el máximo de 250 MB.');

  const initResponse = await fetch(`${base}/api/media/video/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, chunkSize: VIDEO_CHUNK_BYTES }),
  });
  const init = await initResponse.json() as { ok: boolean; uploadId?: string; chunkSize?: number; error?: string };
  if (!initResponse.ok || !init.ok || !init.uploadId) throw new Error(init.error || 'No fue posible iniciar la carga del video.');

  const chunkSize = init.chunkSize || VIDEO_CHUNK_BYTES;
  let received = 0;
  while (received < file.size) {
    const end = Math.min(received + chunkSize, file.size);
    const chunk = await file.slice(received, end).arrayBuffer();
    const response = await fetch(`${base}/api/media/video/${init.uploadId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Chunk-Start': String(received),
        'X-Chunk-End': String(end),
        'X-Upload-Size': String(file.size),
      },
      body: chunk,
    });
    const data = await response.json() as { ok: boolean; received?: number; complete?: boolean; error?: string };
    if (!response.ok || !data.ok || data.received !== end) throw new Error(data.error || 'Falló la carga de un fragmento de video.');
    received = end;
    onProgress?.(Math.round((received / file.size) * 100));
  }

  return { type: 'video', name: file.name, mimeType: file.type, uploadId: init.uploadId, size: file.size };
}

export async function sendAndrewMessage(request: AndrewChatRequest, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<AndrewChatResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${getBackendUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: request.message.trim(), conversationId: request.conversationId, memory: request.memory?.slice(0, 20), attachment: request.attachment }),
        signal: controller.signal,
      });
      const data = await response.json() as AndrewChatResponse | AndrewChatError;
      if (!response.ok || !data.ok) throw new Error(data.ok ? 'Andrew backend request failed' : (data.message || data.error));
      return data;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES || !isRetryable(error)) throw error;
      await sleep(BACKOFF_MS * (attempt + 1));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No fue posible conectar con Andrew.');
}

export async function checkAndrewBackend(): Promise<boolean> {
  try {
    const response = await fetch(`${getBackendUrl()}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
