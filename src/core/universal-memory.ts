const STORAGE_KEY = 'andrew:universal-memory:v1';
const LEGACY_USER_NAME_KEY = 'andrew:user-name';
const DB_NAME = 'andrew-universal-memory';
const DB_STORE = 'memory';
const DB_KEY = 'current';

export type UniversalMemory = {
  name?: string;
  updatedAt: string;
};

let memoryCache: UniversalMemory = { updatedAt: new Date(0).toISOString() };

function readLocal(): UniversalMemory {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyName = window.localStorage.getItem(LEGACY_USER_NAME_KEY)?.trim();
      return legacyName ? { name: legacyName.slice(0, 80), updatedAt: new Date().toISOString() } : { ...memoryCache };
    }
    const parsed = JSON.parse(raw) as Partial<UniversalMemory>;
    return {
      ...(typeof parsed.name === 'string' && parsed.name.trim() ? { name: parsed.name.trim().slice(0, 80) } : {}),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return { ...memoryCache };
  }
}

function writeLocal(memory: UniversalMemory): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    if (memory.name) window.localStorage.setItem(LEGACY_USER_NAME_KEY, memory.name);
    else window.localStorage.removeItem(LEGACY_USER_NAME_KEY);
  } catch {
    // Persistence is best-effort in restricted WebViews.
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIndexedDb(): Promise<UniversalMemory | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => {
        const value = request.result as Partial<UniversalMemory> | undefined;
        resolve(value && typeof value.updatedAt === 'string'
          ? { ...(typeof value.name === 'string' && value.name.trim() ? { name: value.name.trim().slice(0, 80) } : {}), updatedAt: value.updatedAt }
          : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIndexedDb(memory: UniversalMemory): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const request = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(memory, DB_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function hydrateUniversalMemory(): Promise<UniversalMemory> {
  const local = readLocal();
  memoryCache = local;
  const indexed = await readIndexedDb();
  if (indexed && new Date(indexed.updatedAt).getTime() >= new Date(local.updatedAt).getTime()) {
    memoryCache = indexed;
    writeLocal(indexed);
  }
  return { ...memoryCache };
}

export function getUniversalMemory(): UniversalMemory {
  return { ...memoryCache };
}

export function rememberUserName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!normalized) throw new Error('El nombre está vacío.');
  memoryCache = { name: normalized, updatedAt: new Date().toISOString() };
  writeLocal(memoryCache);
  void writeIndexedDb(memoryCache);
  return normalized;
}

export function forgetUserName(): void {
  memoryCache = { updatedAt: new Date().toISOString() };
  writeLocal(memoryCache);
  void writeIndexedDb(memoryCache);
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
