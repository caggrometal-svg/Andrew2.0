import { describe, expect, it } from 'vitest';
import { learnFromOutcome } from './learning-loop';
import { clearLearningMemory } from '../memory/learning-memory';

describe('IAC33 learning input boundaries', () => {
  it('clamps probabilities before calibration and storage', () => {
    clearLearningMemory();
    const memory = learnFromOutcome({ projectId: 'boundary', domain: 'test', predicted: 2, observed: false });
    expect(memory.predicted).toBeLessThanOrEqual(1);
    expect(memory.predicted).toBeGreaterThanOrEqual(0);
    expect(memory.brierScore).toBe(1);
  });
});
