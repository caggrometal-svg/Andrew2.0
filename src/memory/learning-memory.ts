export interface LearningMemory {
  id: string;
  projectId: string;
  domain: string;
  lesson: string;
  predicted: number;
  observed: boolean;
  brierScore: number;
  createdAt: string;
}

const KEY = 'iac33-learning-memory-v1';
const MAX_ITEMS = 500;

function read(): LearningMemory[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LearningMemory =>
      Boolean(item) && typeof item === 'object' &&
      typeof (item as LearningMemory).id === 'string' &&
      typeof (item as LearningMemory).projectId === 'string' &&
      typeof (item as LearningMemory).domain === 'string' &&
      typeof (item as LearningMemory).lesson === 'string' &&
      Number.isFinite((item as LearningMemory).predicted) &&
      typeof (item as LearningMemory).observed === 'boolean' &&
      Number.isFinite((item as LearningMemory).brierScore) &&
      typeof (item as LearningMemory).createdAt === 'string',
    );
  } catch {
    return [];
  }
}

function write(items: LearningMemory[]): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function saveLearningMemory(memory: LearningMemory): void {
  const predicted = Math.max(0, Math.min(1, memory.predicted));
  const brierScore = Math.pow(predicted - (memory.observed ? 1 : 0), 2);
  write([{ ...memory, predicted, brierScore }, ...read()]);
}

export function getLearningMemory(projectId?: string, domain?: string): LearningMemory[] {
  return read().filter((item) =>
    (!projectId || item.projectId === projectId) && (!domain || item.domain === domain),
  );
}

export function clearLearningMemory(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
