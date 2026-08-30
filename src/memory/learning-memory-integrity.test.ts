import { beforeEach, describe, expect, it } from 'vitest';
import { clearLearningMemory, getLearningMemory, saveLearningMemory } from './learning-memory';

describe('IAC33 learning memory integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLearningMemory();
  });

  it('rejects malformed stored entries without crashing', () => {
    localStorage.setItem('iac33-learning-memory-v1', JSON.stringify([{ bad: true }]));
    expect(getLearningMemory()).toEqual([]);
  });

  it('stores normalized probabilities and bounded records', () => {
    saveLearningMemory({ id: 'x', projectId: 'p', domain: 'd', lesson: 'l', predicted: -1, observed: true, brierScore: 99, createdAt: new Date().toISOString() });
    const item = getLearningMemory('p', 'd')[0];
    expect(item.predicted).toBe(0);
    expect(item.brierScore).toBe(1);
  });
});
