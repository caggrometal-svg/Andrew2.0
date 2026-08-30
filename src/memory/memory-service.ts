import type { MemoryItem, LearningEvent } from './memory-types';
import { MemoryStore } from './memory-store';

export class MemoryService {
  constructor(private readonly store: MemoryStore) {}

  remember(memory: MemoryItem): MemoryItem {
    return this.store.remember(memory);
  }

  recall(query: string): MemoryItem[] {
    return this.store.search(query);
  }

  learn(event: LearningEvent): void {
    this.store.learn(event);
  }

  history(): LearningEvent[] {
    return this.store.learningHistory();
  }
}
