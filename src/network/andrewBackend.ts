export type AndrewMemoryContext = string;

export interface AndrewAttachment {
  type: 'image' | 'video';
  name: string;
  mimeType: string;
  dataUrl?: string;
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

export async function sendAndrewMessage(
  request: AndrewChatRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<AndrewChatResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${getBackendUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: request.message.trim(),
          conversationId: request.conversationId,
          memory: request.memory?.slice(0, 20),
          attachment: request.attachment,
        }),
        signal: controller.signal,
      });

      const data = await response.json() as AndrewChatResponse | AndrewChatError;
      if (!response.ok || !data.ok) {
        throw new Error(data.ok ? 'Andrew backend request failed' : (data.message || data.error));
      }
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
