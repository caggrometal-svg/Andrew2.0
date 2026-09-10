import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearMemories,
  closeMemoryStore,
  createMemory,
  deleteMemory,
  getMemory,
  initializeMemoryStore,
  listMemories,
  updateMemory,
} from '../server/memory/memory-store.mjs';

const userId = `qa-memory-${Date.now()}`;
let created;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for memory integration tests');
  await initializeMemoryStore();
  await clearMemories(userId);
});

afterAll(async () => {
  await clearMemories(userId);
  await closeMemoryStore();
});

describe('Andrew persistent memory CRUD', () => {
  it('creates and reads a memory', async () => {
    created = await createMemory({ userId, conversationId: 'qa-conversation', kind: 'fact', text: 'Andrew persistence QA fact', tags: ['qa', 'persistent'], importance: 5, source: 'integration-test' });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await getMemory(userId, created.id))?.text).toBe('Andrew persistence QA fact');
  });

  it('lists the created memory', async () => {
    const memories = await listMemories(userId);
    expect(memories.some((memory) => memory.id === created.id)).toBe(true);
  });

  it('updates the memory', async () => {
    const updated = await updateMemory(userId, created.id, { text: 'Andrew persistence QA fact UPDATED', tags: ['qa', 'updated'], importance: 4 });
    expect(updated.text).toBe('Andrew persistence QA fact UPDATED');
    expect(updated.importance).toBe(4);
  });

  it('survives a store restart', async () => {
    await closeMemoryStore();
    await initializeMemoryStore();
    const afterRestart = await getMemory(userId, created.id);
    expect(afterRestart?.text).toBe('Andrew persistence QA fact UPDATED');
  });

  it('deletes the memory', async () => {
    expect(await deleteMemory(userId, created.id)).toBe(true);
    expect(await getMemory(userId, created.id)).toBeNull();
  });
});
