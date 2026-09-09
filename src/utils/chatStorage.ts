import { Preferences } from "@capacitor/preferences";
import type { ChatMessage } from "../network/aiClient";

const KEY = "andrew.chat.history.v1";

function valid(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (message.role === "system" || message.role === "user" || message.role === "assistant") && typeof message.content === "string";
}

function parse(value: string | null): ChatMessage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch { return []; }
}

export async function loadChatHistory(): Promise<ChatMessage[]> {
  try {
    const result = await Preferences.get({ key: KEY });
    return parse(result.value);
  } catch {
    return [];
  }
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(messages.filter(valid)) });
}

export async function clearChatHistory(): Promise<void> {
  await Preferences.remove({ key: KEY });
}
