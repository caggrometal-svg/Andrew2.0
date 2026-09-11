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
    const existingIndex = memories.findIndex((item) => item.id === memory.id);
    if (existingIndex >= 0) memories[existingIndex] = memory;
    else memories.push(memory);
    this.storage.set(MEMORY_KEY, memories);
    return memory;
  }

  search(query: string): MemoryItem[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    const memories = this.list();
    const now = new Date().toISOString();
    const found = memories.filter((memory) => terms.every((term) =>
      `${memory.content} ${memory.tags.join(' ')}`.toLowerCase().includes(term),
    ));

    if (!found.length) return [];

    const foundIds = new Set(found.map((memory) => memory.id));
    const updated = memories.map((memory) => foundIds.has(memory.id)
      ? { ...memory, accessCount: memory.accessCount + 1, updatedAt: now }
      : memory);
    this.storage.set(MEMORY_KEY, updated);
    return updated.filter((memory) => foundIds.has(memory.id));
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
