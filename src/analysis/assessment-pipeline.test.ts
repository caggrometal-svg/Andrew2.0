import { describe, expect, it } from 'vitest';
import { runAssessment } from './assessment-pipeline';

describe('IAC33 assessment pipeline', () => {
  it('runs without historical learning context', () => {
    const result = runAssessment({
      domain: 'earthquake',
      signals: [{ name: 'signal-a', value: 0.7 }],
      evidence: [],
      projectId: 'test-project',
    });
    expect(result.forecast.domain).toBe('earthquake');
    expect(result.learningContext).toEqual([]);
  });
});
