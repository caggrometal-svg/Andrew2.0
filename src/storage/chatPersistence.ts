const STORAGE_KEY = 'andrew2-chat-history-v1';
const LEGACY_STORAGE_KEY = STORAGE_KEY;

export type PersistedChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  attachment?: unknown;
};

function conversationKey(conversationId?: string): string {
  const normalized = conversationId?.trim();
  return normalized ? `${STORAGE_KEY}:${normalized}` : STORAGE_KEY;
}

function read(key: string): PersistedChatMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadChatHistory(conversationId?: string): PersistedChatMessage[] {
  const key = conversationKey(conversationId);
  const scoped = read(key);
  if (scoped.length || !conversationId) return scoped;

  const legacy = read(LEGACY_STORAGE_KEY);
  if (!legacy.length) return [];
  try {
    localStorage.setItem(key, JSON.stringify(legacy.slice(-100)));
  } catch {
    // Best effort migration; the in-memory result remains usable.
  }
  return legacy.slice(-100);
}

export function saveChatHistory(messages: PersistedChatMessage[], conversationId?: string): void {
  try {
    localStorage.setItem(conversationKey(conversationId), JSON.stringify(messages.slice(-100)));
  } catch {
    // Storage can be unavailable or full; chat remains usable in memory.
  }
}

export function clearChatHistory(conversationId?: string): void {
  try {
    localStorage.removeItem(conversationKey(conversationId));
  } catch {
    // Ignore storage failures.
  }
}
