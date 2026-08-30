export type MemoryKind = 'fact' | 'preference' | 'goal' | 'experience' | 'lesson';
export type MemorySource = 'user' | 'assistant' | 'system' | 'inference';

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  source: MemorySource;
  importance: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  accessCount: number;
}

export interface LearningEvent {
  id: string;
  memoryId?: string;
  signal: 'positive' | 'negative' | 'correction' | 'confirmation';
  feedback: string;
  createdAt: string;
}
