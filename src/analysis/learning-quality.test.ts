import { beforeEach, describe, expect, it } from 'vitest';
import { learnFromOutcome } from './learning-loop';
import { runAssessment } from './assessment-pipeline';
import { clearLearningMemory, getLearningMemory } from '../memory/learning-memory';

describe('IAC33 learning quality', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLearningMemory();
  });

  it('normalizes invalid probabilities and recalculates Brier score', () => {
    const memory = learnFromOutcome({
      projectId: 'p', domain: 'test', predicted: 1.7, observed: false,
    });
    expect(memory.predicted).toBe(1);
    expect(memory.brierScore).toBe(1);
  });

  it('gives correct forecasts better historical quality than incorrect forecasts', () => {
    learnFromOutcome({ projectId: 'p', domain: 'test', predicted: 1, observed: true });
    learnFromOutcome({ projectId: 'p', domain: 'test', predicted: 1, observed: false });
    const memories = getLearningMemory('p', 'test');
    expect(memories[0].brierScore).toBe(1);
    expect(memories[1].brierScore).toBe(0);

    const result = runAssessment({
      projectId: 'p', domain: 'test', signals: [{ name: 's', value: 0.5, weight: 1 }], evidence: [],
    });
    expect(result.learningContext).toHaveLength(2);
    expect(result.forecast).toBeDefined();
  });
});
