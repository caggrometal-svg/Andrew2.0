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

function read(): LearningMemory[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LearningMemory[]) : [];
  } catch {
    return [];
  }
}

function write(items: LearningMemory[]): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(items));
}

export function saveLearningMemory(memory: LearningMemory): void {
  write([memory, ...read()].slice(0, 500));
}

export function getLearningMemory(projectId?: string, domain?: string): LearningMemory[] {
  return read().filter((item) =>
    (!projectId || item.projectId === projectId) && (!domain || item.domain === domain),
  );
}

export function clearLearningMemory(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
