export interface MemoryRecord {
  readonly id: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  readonly createdAt: string;
}

export interface MemoryQuery {
  readonly text?: string;
  readonly limit?: number;
  readonly namespace?: string;
}

export interface MemoryStorePort {
  put(record: MemoryRecord): Promise<void>;
  get(id: string): Promise<MemoryRecord | null>;
  query(query: MemoryQuery): Promise<readonly MemoryRecord[]>;
  delete(id: string): Promise<boolean>;
}
