const STORAGE_KEY = 'andrew2-chat-history-v1';

export type PersistedChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  attachment?: unknown;
};

export function loadChatHistory(): PersistedChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(messages: PersistedChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch {
    // Storage can be unavailable or full; chat remains usable in memory.
  }
}

export function clearChatHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
