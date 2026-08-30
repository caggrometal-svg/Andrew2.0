import { beforeEach, describe, expect, it } from 'vitest';
import { learnFromOutcome } from './learning-loop';
import { runAssessment } from './assessment-pipeline';
import { clearLearningMemory } from '../memory/learning-memory';

describe('IAC33 learning quality', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLearningMemory();
  });

  it('records a low Brier score for a correct confident prediction', () => {
    const memory = learnFromOutcome({ projectId: 'quality', domain: 'earthquake', predicted: 0.9, observed: true });
    expect(memory.predicted).toBe(0.9);
    expect(memory.brierScore).toBeCloseTo(0.01);
  });

  it('records a high Brier score for an incorrect confident prediction', () => {
    const memory = learnFromOutcome({ projectId: 'quality', domain: 'earthquake', predicted: 0.9, observed: false });
    expect(memory.predicted).toBe(0.9);
    expect(memory.brierScore).toBeCloseTo(0.81);
  });

  it('keeps historical learning scoped to the project and domain', () => {
    learnFromOutcome({ projectId: 'quality', domain: 'earthquake', predicted: 0.9, observed: false });
    const result = runAssessment({ projectId: 'quality', domain: 'earthquake', signals: [{ name: 'signal', value: 0.8, weight: 1 }], evidence: [] });
    expect(result.learningContext).toHaveLength(1);
    expect(result.learningContext[0].brierScore).toBeCloseTo(0.81);
    expect(result.forecast).toBeDefined();
  });
});
