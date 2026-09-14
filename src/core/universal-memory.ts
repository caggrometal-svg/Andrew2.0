const STORAGE_KEY = 'andrew:universal-memory:v1';
const LEGACY_USER_NAME_KEY = 'andrew:user-name';

export type UniversalMemory = {
  name?: string;
  updatedAt: string;
};

function read(): UniversalMemory {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyName = window.localStorage.getItem(LEGACY_USER_NAME_KEY)?.trim();
      return legacyName ? { name: legacyName.slice(0, 80), updatedAt: new Date().toISOString() } : { updatedAt: new Date(0).toISOString() };
    }
    const parsed = JSON.parse(raw) as Partial<UniversalMemory>;
    return {
      ...(typeof parsed.name === 'string' && parsed.name.trim() ? { name: parsed.name.trim().slice(0, 80) } : {}),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return { updatedAt: new Date(0).toISOString() };
  }
}

function write(memory: UniversalMemory): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    if (memory.name) window.localStorage.setItem(LEGACY_USER_NAME_KEY, memory.name);
    else window.localStorage.removeItem(LEGACY_USER_NAME_KEY);
  } catch {
    // Persistence is best-effort in restricted WebViews.
  }
}

export function getUniversalMemory(): UniversalMemory {
  return read();
}

export function rememberUserName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!normalized) throw new Error('El nombre está vacío.');
  write({ name: normalized, updatedAt: new Date().toISOString() });
  return normalized;
}

export function forgetUserName(): void {
  write({ updatedAt: new Date().toISOString() });
}

export function extractExplicitUserName(text: string): string | null {
  const normalized = text.trim();
  const patterns = [
    /\bmi nombre es\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3})/iu,
    /\bsoy\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3})/iu,
    /\bme llamo\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3})/iu,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return rememberUserName(match[1]);
  }
  return null;
}

export function isNameRecallQuery(text: string): boolean {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return /^(di|dime|recuerdas?|recuerda|cual es|como me llamo|quien soy)\b.*\b(nombre|llamo|soy|me)\b/.test(normalized)
    || /^(di|dime)\s+mi\s+nombre\b/.test(normalized)
    || /^\?*\s*cual\s+es\s+mi\s+nombre\s*\?*$/.test(normalized)
    || /^\?*\s*quien\s+soy\s*\?*$/.test(normalized);
}

export function isUniversalMemoryCommand(text: string): boolean {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return normalized.includes('memoria universal')
    || normalized.includes('entre chat')
    || normalized.includes('entre chats')
    || normalized.includes('recuerdalo')
    || normalized.includes('recuérdalo');
}
