import { beforeEach, describe, expect, it } from 'vitest';
import { Iac33Kernel } from './iac33-kernel';
import { validateLearningMemory } from '../memory/learning-memory';

describe('IAC33 functional kernel', () => {
  beforeEach(() => localStorage.clear());

  it('runs prediction -> outcome -> Brier -> learning -> next prediction', () => {
    const kernel = new Iac33Kernel('project-a');
    kernel.setProjectState({ status: 'active' });
    const prediction = kernel.createPrediction({ domain: 'general', hypothesis: 'Primary scenario occurs.', signals: [{ name: 'signal', value: 0.8, weight: 1 }], evidence: [{ id: 'src-1', kind: 'evidence', source: 'public-source' }] });
    expect(prediction.status).toBe('pending');
    const resolved = kernel.resolvePrediction(prediction.id, true, 'Outcome matched.');
    expect(resolved.status).toBe('resolved');
    expect(resolved.brierScore).toBeDefined();
    expect(kernel.getLearning()).toHaveLength(1);
    expect(kernel.getLearningWeight('general')).toBeGreaterThan(0);
    const next = kernel.createPrediction({ domain: 'general', hypothesis: 'Second forecast uses history.', signals: [{ name: 'signal', value: 0.8, weight: 1 }] });
    expect(next.status).toBe('pending');
    expect(kernel.getPredictions()).toHaveLength(2);
  });

  it('scores an incorrect prediction and penalizes learning weight', () => {
    const kernel = new Iac33Kernel('project-a');
    const prediction = kernel.createPrediction({ domain: 'general', hypothesis: 'Primary scenario occurs.', signals: [{ name: 'signal', value: 0.9 }] });
    const resolved = kernel.resolvePrediction(prediction.id, false, 'Outcome did not occur.');
    expect(resolved.brierScore).toBeGreaterThan(0.25);
    expect(kernel.getLearningWeight('general')).toBeLessThan(1);
    expect(validateLearningMemory('project-a', 'general').valid).toBe(true);
  });

  it('persists state and predictions across kernel instances', () => {
    const first = new Iac33Kernel('persistent-project');
    first.setProjectState({ status: 'active' });
    const prediction = first.createPrediction({ domain: 'social', hypothesis: 'Persistent test.', signals: [{ name: 'signal', value: 0.6 }] });
    const second = new Iac33Kernel('persistent-project');
    expect(second.getProject().status).toBe('active');
    expect(second.getPredictions().some((item) => item.id === prediction.id)).toBe(true);
  });

  it('isolates learning by project and domain', () => {
    const a = new Iac33Kernel('project-a');
    const b = new Iac33Kernel('project-b');
    const prediction = a.createPrediction({ domain: 'earthquake', hypothesis: 'Test earthquake.', signals: [{ name: 'signal', value: 0.7 }] });
    a.resolvePrediction(prediction.id, false, 'Did not occur.');
    expect(a.getLearning()).toHaveLength(1);
    expect(a.getLearningWeight('earthquake')).toBeLessThan(1);
    expect(b.getLearning()).toHaveLength(0);
    expect(b.getLearningWeight('earthquake')).toBe(1);
  });

  it('supports permissions, activity, memory update and deletion', () => {
    const kernel = new Iac33Kernel('project-a');
    kernel.setPermission('memory.write', 'allow', 'test');
    const prediction = kernel.createPrediction({ domain: 'social', hypothesis: 'Test social.', signals: [{ name: 'signal', value: 0.6 }] });
    kernel.resolvePrediction(prediction.id, true, 'Observed.');
    const memory = kernel.getLearning()[0];
    const updated = kernel.updateMemory(memory.id, { lesson: 'Updated lesson', predicted: 0.55 });
    expect(updated.lesson).toBe('Updated lesson');
    expect(updated.brierScore).toBeCloseTo(0.2025);
    kernel.deleteMemory(memory.id);
    expect(kernel.getLearning()).toHaveLength(0);
    expect(kernel.getActivity().some((item) => item.action === 'prediction.resolve')).toBe(true);
  });
});
