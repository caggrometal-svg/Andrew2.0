import type { ActivityRecord } from '../core/types';
import type { MemoryItem } from './memory-types';
import { MemoryService } from './memory-service';

export class LearningLoop {
  constructor(private readonly memory: MemoryService) {}

  learnFromActivity(activity: ActivityRecord): MemoryItem | undefined {
    if (activity.result === 'denied' || !activity.details?.lesson) return undefined;

    const memory: MemoryItem = {
      id: crypto.randomUUID(),
      kind: 'lesson',
      content: String(activity.details.lesson),
      source: 'system',
      importance: 0.5,
      confidence: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['learned', activity.capability],
      accessCount: 0,
    };

    return this.memory.remember(memory);
  }

  applyFeedback(memoryId: string, signal: 'positive' | 'negative' | 'correction' | 'confirmation', feedback: string): void {
    this.memory.learn({
      id: crypto.randomUUID(),
      memoryId,
      signal,
      feedback,
      createdAt: new Date().toISOString(),
    });
  }
}
