import { calibrateForecasts } from './forecast-calibration';
import { saveLearningMemory, type LearningMemory } from '../memory/learning-memory';

export interface LearningInput {
  projectId: string;
  domain: string;
  predicted: number;
  observed: boolean;
  lesson?: string;
}

export function learnFromOutcome(input: LearningInput): LearningMemory {
  const predicted = Number.isFinite(input.predicted)
    ? Math.max(0, Math.min(1, input.predicted))
    : 0.5;
  const report = calibrateForecasts([{ predicted, observed: input.observed }]);
  const memory: LearningMemory = {
    id: `learn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: input.projectId,
    domain: input.domain,
    lesson: input.lesson ?? (input.observed
      ? 'El escenario observado coincidió con la predicción; conservar la señal como evidencia histórica.'
      : 'El escenario no se observó; reducir confianza en las señales que sustentaron esta predicción.'),
    predicted,
    observed: input.observed,
    brierScore: report.brierScore,
    createdAt: new Date().toISOString(),
  };
  saveLearningMemory(memory);
  return memory;
}
