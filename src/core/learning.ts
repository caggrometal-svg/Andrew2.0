import { isAllowed, type Permission, type PermissionState } from './permissions';
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

function readLearning(): LearningRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
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
  const state = permissions;
  requirePermission('analysis.run', state);
  requirePermission('memory.write', state);

  const record: LearningRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    confidence: Math.min(1, Math.max(0, input.confidence)),
  };

  const records = [record, ...readLearning()].slice(0, 1000);
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(records));

  saveMemory(`Aprendizaje IAC33: ${record.lesson}`, ['learning', record.projectId]);
  logActivity({
    type: 'memory',
    action: 'learning.recorded',
    details: { projectId: record.projectId, confidence: record.confidence },
  });

  return record;
}

export function findRelevantLessons(query: string, projectId?: string): LearningRecord[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
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

function requirePermission(permission: Permission, state?: PermissionState[]): void {
  if (!isAllowed(permission, state)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
