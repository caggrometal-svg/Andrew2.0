import { beforeEach, describe, expect, it } from 'vitest';
import { clearLearningMemory, getLearningMemory, saveLearningMemory } from './learning-memory';

describe('IAC33 learning memory', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLearningMemory();
  });

  it('persists and filters memories by project and domain', () => {
    saveLearningMemory({ id: '1', projectId: 'a', domain: 'earthquake', lesson: 'x', predicted: 0.5, observed: true, brierScore: 0.25, createdAt: new Date().toISOString() });
    saveLearningMemory({ id: '2', projectId: 'b', domain: 'earthquake', lesson: 'y', predicted: 0.5, observed: false, brierScore: 0.25, createdAt: new Date().toISOString() });

    expect(getLearningMemory('a', 'earthquake')).toHaveLength(1);
    expect(getLearningMemory('a', 'earthquake')[0].id).toBe('1');
    expect(getLearningMemory('b', 'earthquake')).toHaveLength(1);
  });
});
