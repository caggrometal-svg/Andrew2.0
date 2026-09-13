export interface IAC33Record {
  id: string;
  kind: 'memory' | 'source' | 'investigation' | 'activity';
  data: unknown;
  createdAt: string;
}

const KEY = 'iac33.records';
const MAX_RECORDS = 1000;

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function records(): IAC33Record[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record): record is IAC33Record => Boolean(
      record && typeof record === 'object' &&
      typeof (record as IAC33Record).id === 'string' &&
      typeof (record as IAC33Record).kind === 'string' &&
      typeof (record as IAC33Record).createdAt === 'string'
    )).slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

export function addRecord(kind: IAC33Record['kind'], data: unknown): IAC33Record {
  const record: IAC33Record = {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    kind,
    data,
    createdAt: new Date().toISOString(),
  };
  if (storageAvailable()) {
    try {
      localStorage.setItem(KEY, JSON.stringify([record, ...records()].slice(0, MAX_RECORDS)));
    } catch {
      // Persistence is best-effort; callers still receive the in-memory record.
    }
  }
  return record;
}

export function clearRecords(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore restricted or unavailable storage.
  }
}
