import { requireAuthorization } from './authorization';
import type { PermissionState } from './permissions';
import { logActivity } from './activity-log';
import { getMemories, saveMemory } from './memory';

export interface LearningRecord {
  id: string;
  projectId: string;
  question: string;
  observation: string;
  outcome: string;
  lesson: string;
  confidence: number;
  createdAt: string;
}

const KEY = 'iac33.learning';
const MAX_RECORDS = 1000;
const MAX_TEXT_LENGTH = 20_000;

function readLearning(): LearningRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLearningRecord).slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

export function getLearningRecords(projectId?: string): LearningRecord[] {
  const records = readLearning();
  return projectId ? records.filter((record) => record.projectId === projectId) : records;
}

export function learnFromOutcome(
  input: Omit<LearningRecord, 'id' | 'createdAt'>,
  permissions?: PermissionState[],
): LearningRecord {
  requireAuthorization('analysis.run', permissions);
  requireAuthorization('memory.write', permissions);
  validateLearningInput(input);

  const record: LearningRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    confidence: Math.min(1, Math.max(0, input.confidence)),
  };

  const records = [record, ...readLearning()].slice(0, MAX_RECORDS);
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(records));

  saveMemory(`Aprendizaje IAC33: ${record.lesson}`, ['learning', record.projectId], permissions);
  logActivity({
    type: 'memory',
    action: 'learning.recorded',
    details: { projectId: record.projectId, confidence: record.confidence },
  });

  return record;
}

export function findRelevantLessons(query: string, projectId?: string): LearningRecord[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return getLearningRecords(projectId)
    .map((record) => ({
      record,
      score: terms.reduce((score, term) =>
        score + (record.lesson.toLowerCase().includes(term) ? 2 : 0)
        + (record.observation.toLowerCase().includes(term) ? 1 : 0)
        + (record.question.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.record)
    .slice(0, 10);
}

export function learningStats(projectId?: string) {
  const records = getLearningRecords(projectId);
  const memories = getMemories().filter((memory) => memory.tags.includes('learning'));
  const averageConfidence = records.length
    ? records.reduce((sum, record) => sum + record.confidence, 0) / records.length
    : 0;
  return { records: records.length, learningMemories: memories.length, averageConfidence };
}

function validateLearningInput(input: Omit<LearningRecord, 'id' | 'createdAt'>): void {
  for (const [name, value] of Object.entries(input)) {
    if (name === 'confidence') continue;
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT_LENGTH) {
      throw new Error(`Invalid learning field: ${name}`);
    }
  }
  if (!Number.isFinite(input.confidence)) throw new Error('Invalid learning confidence');
}

function isLearningRecord(value: unknown): value is LearningRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LearningRecord>;
  return typeof record.id === 'string'
    && typeof record.projectId === 'string'
    && typeof record.question === 'string'
    && typeof record.observation === 'string'
    && typeof record.outcome === 'string'
    && typeof record.lesson === 'string'
    && typeof record.confidence === 'number'
    && Number.isFinite(record.confidence)
    && typeof record.createdAt === 'string';
}
