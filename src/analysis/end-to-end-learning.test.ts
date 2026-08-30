import { beforeEach, describe, expect, it } from 'vitest';
import { learnFromOutcome } from './learning-loop';
import { runAssessment } from './assessment-pipeline';
import { clearLearningMemory, getLearningMemory } from '../memory/learning-memory';

describe('IAC33 end-to-end learning loop', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLearningMemory();
  });

  it('persists an outcome and reinjects it into the next assessment', () => {
    const projectId = 'e2e-project';

    const before = runAssessment({
      projectId,
      domain: 'earthquake',
      signals: [{ name: 'historical-signal', value: 0.8, weight: 1 }],
      evidence: [],
    });

    expect(before.learningContext).toHaveLength(0);

    const memory = learnFromOutcome({
      projectId,
      domain: 'earthquake',
      predicted: 0.9,
      observed: false,
    });

    expect(memory.brierScore).toBeCloseTo(0.81);
    expect(getLearningMemory(projectId, 'earthquake')).toHaveLength(1);

    const after = runAssessment({
      projectId,
      domain: 'earthquake',
      signals: [{ name: 'historical-signal', value: 0.8, weight: 1 }],
      evidence: [],
    });

    expect(after.learningContext).toHaveLength(1);
    expect(after.notes.some((note) => note.includes('1 resultados históricos'))).toBe(true);
    expect(after.forecast).toBeDefined();
  });

  it('does not leak learning between projects', () => {
    learnFromOutcome({
      projectId: 'project-a',
      domain: 'earthquake',
      predicted: 0.9,
      observed: false,
    });

    const result = runAssessment({
      projectId: 'project-b',
      domain: 'earthquake',
      signals: [{ name: 'signal', value: 0.5 }],
      evidence: [],
    });

    expect(result.learningContext).toHaveLength(0);
  });
});
