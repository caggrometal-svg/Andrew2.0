import { describe, expect, it } from 'vitest';
import { LearningLoop } from './learning-loop';
import { MemoryService } from './memory-service';
import { MemoryStore } from './memory-store';

function makeMemoryService() {
  const data = new Map<string, string>();
  const storage = {
    get<T>(key: string): T | null { const value = data.get(key); return value ? JSON.parse(value) as T : null; },
    set<T>(key: string, value: T): void { data.set(key, JSON.stringify(value)); },
    remove(key: string): void { data.delete(key); },
    clear(): void { data.clear(); },
  };
  return new MemoryService(new MemoryStore(storage));
}

describe('LearningLoop', () => {
  it('stores a lesson from successful activity', () => {
    const memory = makeMemoryService();
    const loop = new LearningLoop(memory);
    const result = loop.learnFromActivity({
      id: 'a1', timestamp: new Date().toISOString(), action: 'analyze',
      capability: 'analysis.run', result: 'success', details: { lesson: 'Prefer corroborated sources.' },
    });
    expect(result?.kind).toBe('lesson');
    expect(memory.recall('corroborated sources')).toHaveLength(1);
  });

  it('records feedback and changes confidence', () => {
    const memory = makeMemoryService();
    const loop = new LearningLoop(memory);
    const lesson = loop.learnFromActivity({
      id: 'a2', timestamp: new Date().toISOString(), action: 'analyze',
      capability: 'analysis.run', result: 'success', details: { lesson: 'Check multiple signals.' },
    })!;
    loop.applyFeedback(lesson.id, 'confirmation', 'Confirmed by user.');
    expect(memory.history()).toHaveLength(1);
    expect(memory.recall('multiple signals')[0].confidence).toBeGreaterThan(0.5);
  });
});
