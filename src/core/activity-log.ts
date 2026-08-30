export type ActivityType = 'analysis' | 'forecast' | 'source-query' | 'memory' | 'connector';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

const KEY = 'iac33.activity';

export function readActivity(): ActivityEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

export function logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
  const item: ActivityEntry = { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
  const entries = [item, ...readActivity()].slice(0, 500);
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(entries));
  return item;
}
