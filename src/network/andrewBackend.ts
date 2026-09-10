export type AndrewMemoryContext = string;

export interface AndrewChatRequest {
  message: string;
  memory?: AndrewMemoryContext[];
}

export interface AndrewChatResponse {
  ok: true;
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

function getBackendUrl(): string {
  const configured = (import.meta.env.VITE_ANDREW_BACKEND_URL || '').trim();
  if (!configured) throw new Error('Andrew backend URL is not configured');
  return configured.replace(/\/$/, '');
}

export async function sendAndrewMessage(
  request: AndrewChatRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<AndrewChatResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getBackendUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: request.message.trim(),
        memory: request.memory?.slice(0, 20),
      }),
      signal: controller.signal,
    });

    const data = await response.json() as AndrewChatResponse | AndrewChatError;
    if (!response.ok || !data.ok) {
      throw new Error(data.ok ? 'Andrew backend request failed' : (data.message || data.error));
    }
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function checkAndrewBackend(): Promise<boolean> {
  try {
    const response = await fetch(`${getBackendUrl()}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
