import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memory-store';
import type { MemoryItem } from './memory-types';

function storage() {
  const data = new Map<string, string>();
  return {
    get<T>(key: string): T | null { const value = data.get(key); return value ? JSON.parse(value) as T : null; },
    set<T>(key: string, value: T): void { data.set(key, JSON.stringify(value)); },
    remove(key: string): void { data.delete(key); },
    clear(): void { data.clear(); },
  };
}

const memory = (): MemoryItem => ({
  id: 'm1', kind: 'fact', content: 'Chile is in South America', source: 'user',
  importance: 0.8, confidence: 0.9, createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), tags: ['chile', 'geography'], accessCount: 0,
});

describe('MemoryStore', () => {
  it('persists and recalls memories', () => {
    const store = new MemoryStore(storage());
    store.remember(memory());
    const found = store.search('Chile geography');
    expect(found).toHaveLength(1);
    expect(found[0].accessCount).toBe(1);
  });
});
