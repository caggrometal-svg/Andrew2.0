import type { ActivityRecord } from '../core/types';
import type { MemoryItem } from './memory-types';
import { MemoryService } from './memory-service';

export class LearningLoop {
  constructor(private readonly memory: MemoryService) {}

  learnFromActivity(activity: ActivityRecord): MemoryItem | undefined {
    const lesson = activity.details?.['lesson'];
    if (activity.result === 'denied' || lesson === undefined || !activity.capability) return undefined;

    const now = new Date().toISOString();
    const memory: MemoryItem = {
      id: crypto.randomUUID(),
      kind: 'lesson',
      content: String(lesson),
      source: 'system',
      importance: 0.5,
      confidence: 0.5,
      createdAt: now,
      updatedAt: now,
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
