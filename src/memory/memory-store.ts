import type { LearningEvent, MemoryItem } from './memory-types';
import type { StorageProvider } from '../storage/storage-provider';

const MEMORY_KEY = 'iac33.memory.v1';
const LEARNING_KEY = 'iac33.learning.v1';

export class MemoryStore {
  constructor(private readonly storage: StorageProvider) {}

  list(): MemoryItem[] {
    return this.storage.get<MemoryItem[]>(MEMORY_KEY) ?? [];
  }

  remember(memory: MemoryItem): MemoryItem {
    const memories = this.list();
    memories.push(memory);
    this.storage.set(MEMORY_KEY, memories);
    return memory;
  }

  search(query: string): MemoryItem[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.list()
      .filter((memory) => terms.every((term) =>
        `${memory.content} ${memory.tags.join(' ')}`.toLowerCase().includes(term),
      ))
      .map((memory) => ({ ...memory, accessCount: memory.accessCount + 1, updatedAt: new Date().toISOString() }));
  }

  learn(event: LearningEvent): void {
    const events = this.storage.get<LearningEvent[]>(LEARNING_KEY) ?? [];
    events.push(event);
    this.storage.set(LEARNING_KEY, events);

    if (!event.memoryId) return;
    const memories = this.list();
    const memory = memories.find((item) => item.id === event.memoryId);
    if (!memory) return;

    const delta = event.signal === 'positive' || event.signal === 'confirmation' ? 0.05 : -0.05;
    memory.confidence = Math.max(0, Math.min(1, memory.confidence + delta));
    memory.updatedAt = new Date().toISOString();
    this.storage.set(MEMORY_KEY, memories);
  }

  learningHistory(): LearningEvent[] {
    return this.storage.get<LearningEvent[]>(LEARNING_KEY) ?? [];
  }
}
