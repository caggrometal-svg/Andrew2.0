export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AiClientState = "idle" | "sending" | "error";

export interface AiClientStatus {
  state: AiClientState;
  error: string | null;
}

export interface ChatResponse {
  message: string;
}

const API_URL = (import.meta.env.VITE_AI_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const REQUEST_TIMEOUT_MS = 30000;

class AiClient {
  private status: AiClientStatus = { state: "idle", error: null };
  private listeners = new Set<(status: AiClientStatus) => void>();

  getStatus(): AiClientStatus { return this.status; }

  subscribe(listener: (status: AiClientStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: AiClientStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  async sendMessage(messages: ChatMessage[]): Promise<ChatResponse> {
    if (!API_URL) {
      const error = "Andrew no tiene configurado el servidor de IA (VITE_AI_API_URL).";
      this.setStatus({ state: "error", error });
      throw new Error(error);
    }

    this.setStatus({ state: "sending", error: null });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || `Error del servidor (${response.status}).`);
      }

      const data = await response.json() as Partial<ChatResponse>;
      if (typeof data.message !== "string" || !data.message.trim()) {
        throw new Error("El servidor devolvió una respuesta inválida.");
      }

      this.setStatus({ state: "idle", error: null });
      return { message: data.message };
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Tiempo de espera agotado al contactar a Andrew."
        : error instanceof Error ? error.message : "No fue posible contactar al servidor.";
      this.setStatus({ state: "error", error: message });
      throw new Error(message);
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const aiClient = new AiClient();
