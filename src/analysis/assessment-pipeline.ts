import { assessEvidence, type Evidence, type CriticalAssessment } from './critical';
import { forecast, type ForecastDomain, type Signal, type ForecastResult } from './probabilistic';
import { getLearningMemory, type LearningMemory } from '../memory/learning-memory';

export interface AssessmentInput {
  domain: ForecastDomain;
  signals: Signal[];
  evidence: Evidence[];
  horizon?: string;
  projectId?: string;
}

export interface AssessmentOutput {
  forecast: ForecastResult;
  critical: CriticalAssessment;
  overallConfidence: 'low' | 'medium' | 'high';
  notes: string[];
  learningContext: LearningMemory[];
}

function applyLearningContext(signals: Signal[], memories: LearningMemory[]): Signal[] {
  if (!memories.length) return signals;
  const recent = memories.slice(0, 20);
  const meanError = recent.reduce((sum, item) => sum + Math.abs(item.predicted - (item.observed ? 1 : 0)), 0) / recent.length;
  const reliability = Math.max(0.5, 1 - meanError * 0.5);
  return signals.map((signal) => ({ ...signal, weight: (signal.weight ?? 1) * reliability }));
}

export function runAssessment(input: AssessmentInput): AssessmentOutput {
  const learningContext = input.projectId ? getLearningMemory(input.projectId, input.domain) : [];
  const critical = assessEvidence(input.evidence);
  const forecastResult = forecast(input.domain, applyLearningContext(input.signals, learningContext), input.horizon);
  const levels = ['low', 'medium', 'high'] as const;
  const level = Math.min(levels.indexOf(critical.overallConfidence), levels.indexOf(forecastResult.confidence));
  const notes = [
    'Las probabilidades son escenarios, no predicciones deterministas.',
    'La calidad del resultado depende de la cobertura, actualidad y confiabilidad de las fuentes.',
  ];
  if (learningContext.length) notes.push(`Se incorporaron ${learningContext.length} resultados históricos de aprendizaje.`);
  if (critical.contradictions.length) notes.push('Existen evidencias contradictorias que deben revisarse.');
  return { forecast: forecastResult, critical, overallConfidence: levels[level], notes, learningContext };
}
