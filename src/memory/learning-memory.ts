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

function normalizeProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function computeBrier(predicted: number, observed: boolean): number {
  return Math.pow(normalizeProbability(predicted) - (observed ? 1 : 0), 2);
}

function isValidMemory(item: unknown): item is LearningMemory {
  if (!item || typeof item !== 'object') return false;
  const value = item as Partial<LearningMemory>;
  return typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.domain === 'string' &&
    typeof value.lesson === 'string' &&
    Number.isFinite(value.predicted) &&
    typeof value.observed === 'boolean' &&
    Number.isFinite(value.brierScore) &&
    value.brierScore >= 0 && value.brierScore <= 1 &&
    typeof value.createdAt === 'string';
}

function read(): LearningMemory[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMemory).map((item) => ({
      ...item,
      predicted: normalizeProbability(item.predicted),
      brierScore: computeBrier(item.predicted, item.observed),
    }));
  } catch {
    return [];
  }
}

function write(items: LearningMemory[]): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  }
}

export function saveLearningMemory(memory: LearningMemory): void {
  const predicted = normalizeProbability(memory.predicted);
  const brierScore = computeBrier(predicted, memory.observed);
  write([{ ...memory, predicted, brierScore }, ...read().filter((item) => item.id !== memory.id)]);
}

export function getLearningMemory(projectId?: string, domain?: string): LearningMemory[] {
  return read().filter((item) =>
    (!projectId || item.projectId === projectId) &&
    (!domain || item.domain === domain),
  );
}

export function getLearningWeight(projectId: string, domain?: string): number {
  const memories = getLearningMemory(projectId, domain);
  if (!memories.length) return 1;
  const meanBrier = memories.reduce((sum, item) => sum + item.brierScore, 0) / memories.length;
  return Math.max(0.1, Math.min(1, 1 - meanBrier));
}

export function updateLearningMemory(
  memoryId: string,
  patch: Partial<Pick<LearningMemory, 'lesson' | 'predicted' | 'observed'>>,
): LearningMemory {
  const memories = read();
  const index = memories.findIndex((item) => item.id === memoryId);
  if (index < 0) throw new Error(`Learning memory not found: ${memoryId}`);
  const current = memories[index];
  const predicted = normalizeProbability(patch.predicted ?? current.predicted);
  const observed = patch.observed ?? current.observed;
  const updated: LearningMemory = {
    ...current,
    ...patch,
    predicted,
    observed,
    brierScore: computeBrier(predicted, observed),
  };
  memories[index] = updated;
  write(memories);
  return updated;
}

export function deleteLearningMemory(memoryId: string): void {
  write(read().filter((item) => item.id !== memoryId));
}

export function validateLearningMemory(projectId?: string, domain?: string): {
  valid: boolean;
  checked: number;
  invalid: number;
} {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  if (!raw) return { valid: true, checked: 0, invalid: 0 };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const items = Array.isArray(parsed) ? parsed : [];
    const scoped = items.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Partial<LearningMemory>;
      return (!projectId || value.projectId === projectId) && (!domain || value.domain === domain);
    });
    const invalid = scoped.filter((item) => !isValidMemory(item) ||
      Math.abs((item as LearningMemory).brierScore - computeBrier((item as LearningMemory).predicted, (item as LearningMemory).observed)) > 1e-9).length;
    return { valid: invalid === 0, checked: scoped.length, invalid };
  } catch {
    return { valid: false, checked: 0, invalid: 1 };
  }
}

export function clearLearningMemory(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
