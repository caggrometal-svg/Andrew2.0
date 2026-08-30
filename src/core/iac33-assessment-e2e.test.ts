import { beforeEach, describe, expect, it } from 'vitest';
import { Iac33Kernel } from './iac33-kernel';

describe('IAC33 assessment feedback loop', () => {
  beforeEach(() => localStorage.clear());

  it('keeps evidence distinct from inference and closes the learning loop', () => {
    const kernel = new Iac33Kernel('e2e-project');
    const { assessment, prediction } = kernel.assessAndCreatePrediction({
      domain: 'general',
      hypothesis: 'The primary scenario will occur.',
      signals: [{ name: 'observed signal', value: 0.8, weight: 1 }],
      evidence: [{ source: 'public-source', claim: 'Observed fact', reliability: 0.9 }],
    });

    expect(assessment.critical.facts).toHaveLength(1);
    expect(prediction.evidence[0].kind).toBe('fact');
    expect(prediction.status).toBe('pending');

    const resolved = kernel.resolvePrediction(prediction.id, true, 'Outcome observed.');
    expect(resolved.status).toBe('resolved');
    expect(resolved.brierScore).toBeGreaterThanOrEqual(0);
    expect(resolved.brierScore).toBeLessThanOrEqual(1);
    expect(kernel.getLearning('general')).toBeUndefined();
    expect(kernel.getLearning()).toHaveLength(1);
    expect(kernel.getLearningWeight('general')).toBeGreaterThan(0);
    expect(kernel.getActivity().some((item) => item.action === 'assessment.complete')).toBe(true);
    expect(kernel.getActivity().some((item) => item.action === 'prediction.resolve')).toBe(true);
  });
});
