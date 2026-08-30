import { forecast, type ForecastDomain, type ForecastResult, type Signal } from '../analysis/probabilistic';
import {
  clearLearningMemory,
  deleteLearningMemory,
  getLearningMemory,
  getLearningWeight,
  saveLearningMemory,
  updateLearningMemory,
  type LearningMemory,
} from '../memory/learning-memory';
import { createProjectState, updateProjectState } from '../state/project-state';
import type { ActivityRecord, Capability, PermissionGrant, ProjectState } from './types';

export interface EvidenceRef {
  id: string;
  kind: 'fact' | 'evidence' | 'inference' | 'hypothesis' | 'speculation';
  source: string;
  observedAt?: string;
}

export interface PredictionRecord {
  id: string;
  projectId: string;
  domain: ForecastDomain;
  horizon: string;
  hypothesis: string;
  probability: number;
  uncertainty: number;
  evidence: EvidenceRef[];
  createdAt: string;
  status: 'pending' | 'resolved';
  observed?: boolean;
  brierScore?: number;
  resolvedAt?: string;
}

export interface Iac33KernelSnapshot {
  project: ProjectState;
  permissions: PermissionGrant[];
  activity: ActivityRecord[];
  predictions: PredictionRecord[];
  learning: LearningMemory[];
}

const PREDICTION_KEY = 'iac33-predictions-v1';
const ACTIVITY_KEY = 'iac33-activity-v1';
const PERMISSION_KEY = 'iac33-permissions-v1';
const MAX_RECORDS = 500;

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function projectFilter<T extends { projectId: string }>(items: T[], projectId: string): T[] {
  return items.filter((item) => item.projectId === projectId);
}

export class Iac33Kernel {
  private project: ProjectState;

  constructor(projectId: string) {
    this.project = createProjectState(projectId);
  }

  getProject(): ProjectState {
    return this.project;
  }

  setProjectState(patch: Partial<Omit<ProjectState, 'projectId'>>): ProjectState {
    this.project = updateProjectState(this.project, patch);
    this.recordActivity('state.update', 'state.write', 'success', patch);
    return this.project;
  }

  setPermission(capability: Capability, decision: PermissionGrant['decision'], source = 'iac33'): PermissionGrant {
    const grant: PermissionGrant = { capability, decision, grantedAt: new Date().toISOString(), source };
    const all = readJson<PermissionGrant[]>(PERMISSION_KEY, []).filter((item) => item.capability !== capability);
    writeJson(PERMISSION_KEY, [...all, grant]);
    this.recordActivity('permission.update', 'state.write', 'success', { capability, decision });
    return grant;
  }

  getPermissions(): PermissionGrant[] {
    return readJson<PermissionGrant[]>(PERMISSION_KEY, []);
  }

  recordActivity(
    action: string,
    capability: Capability | undefined,
    result: ActivityRecord['result'],
    details?: Record<string, unknown>,
  ): ActivityRecord {
    const record: ActivityRecord = { id: id('activity'), timestamp: new Date().toISOString(), action, capability, result, details };
    const items = readJson<ActivityRecord[]>(ACTIVITY_KEY, []);
    writeJson(ACTIVITY_KEY, [record, ...items].slice(0, MAX_RECORDS));
    return record;
  }

  getActivity(): ActivityRecord[] {
    return readJson<ActivityRecord[]>(ACTIVITY_KEY, []).filter((item) =>
      item.details?.projectId === this.project.projectId,
    );
  }

  createPrediction(input: {
    domain: ForecastDomain;
    horizon?: string;
    hypothesis: string;
    signals: Signal[];
    evidence?: EvidenceRef[];
  }): PredictionRecord {
    const memories = getLearningMemory(this.project.projectId, input.domain);
    const learningWeight = getLearningWeight(this.project.projectId, input.domain);
    const adjustedSignals = input.signals.map((signal) => ({
      ...signal,
      weight: (signal.weight ?? 1) * learningWeight,
    }));
    const result = forecast(input.domain, adjustedSignals, input.horizon ?? '7 days');
    const primary = result.scenarios[0]?.probability ?? 0.5;
    const record: PredictionRecord = {
      id: id('prediction'),
      projectId: this.project.projectId,
      domain: input.domain,
      horizon: input.horizon ?? result.horizon,
      hypothesis: input.hypothesis,
      probability: primary,
      uncertainty: 1 - Math.min(1, Math.max(0, result.confidence === 'high' ? 0.2 : result.confidence === 'medium' ? 0.45 : 0.7)),
      evidence: input.evidence ?? [],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    const predictions = readJson<PredictionRecord[]>(PREDICTION_KEY, []);
    writeJson(PREDICTION_KEY, [record, ...predictions].slice(0, MAX_RECORDS));
    this.recordActivity('prediction.create', 'analysis.run', 'success', {
      projectId: this.project.projectId,
      predictionId: record.id,
      domain: record.domain,
      memoryCount: memories.length,
      learningWeight,
    });
    return record;
  }

  getPredictions(): PredictionRecord[] {
    return projectFilter(readJson<PredictionRecord[]>(PREDICTION_KEY, []), this.project.projectId);
  }

  resolvePrediction(predictionId: string, observed: boolean, lesson: string): PredictionRecord {
    const predictions = readJson<PredictionRecord[]>(PREDICTION_KEY, []);
    const index = predictions.findIndex((item) => item.id === predictionId && item.projectId === this.project.projectId);
    if (index < 0) throw new Error(`Prediction not found: ${predictionId}`);
    const current = predictions[index];
    if (current.status === 'resolved') return current;
    const brierScore = Math.pow(current.probability - (observed ? 1 : 0), 2);
    const resolved: PredictionRecord = { ...current, observed, brierScore, status: 'resolved', resolvedAt: new Date().toISOString() };
    predictions[index] = resolved;
    writeJson(PREDICTION_KEY, predictions);
    saveLearningMemory({
      id: id('memory'),
      projectId: this.project.projectId,
      domain: current.domain,
      lesson,
      predicted: current.probability,
      observed,
      brierScore,
      createdAt: resolved.resolvedAt ?? new Date().toISOString(),
    });
    this.recordActivity('prediction.resolve', 'memory.write', 'success', {
      projectId: this.project.projectId,
      predictionId,
      observed,
      brierScore,
    });
    return resolved;
  }

  getLearning(): LearningMemory[] {
    return getLearningMemory(this.project.projectId);
  }

  getLearningWeight(domain?: string): number {
    return getLearningWeight(this.project.projectId, domain);
  }

  updateMemory(memoryId: string, patch: Partial<Pick<LearningMemory, 'lesson' | 'predicted' | 'observed'>>): LearningMemory {
    return updateLearningMemory(memoryId, patch);
  }

  deleteMemory(memoryId: string): void {
    deleteLearningMemory(memoryId);
  }

  clearProjectLearning(): void {
    for (const memory of getLearningMemory(this.project.projectId)) deleteLearningMemory(memory.id);
  }

  clearAllLearning(): void {
    clearLearningMemory();
  }

  snapshot(): Iac33KernelSnapshot {
    return {
      project: this.project,
      permissions: this.getPermissions(),
      activity: this.getActivity(),
      predictions: this.getPredictions(),
      learning: this.getLearning(),
    };
  }
}

export type { ForecastResult };
