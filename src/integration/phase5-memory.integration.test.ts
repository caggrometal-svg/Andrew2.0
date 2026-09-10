import { describe, expect, it } from 'vitest';
import { deleteMemory, getMemories, saveMemory, updateMemory } from '../core/memory';
import { LocalStorageProvider } from '../storage/storage-provider';

const granted = [{ capability: 'memory.write', decision: 'allow' as const }];

describe('Phase 5 persistent memory gate', () => {
  it('persists a memory across independent reads through the same storage provider', () => {
    const storage = new LocalStorageProvider();
    const created = saveMemory('Andrew remembers this.', ['phase5'], granted, storage);

    const reloaded = getMemories(storage);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ id: created.id, text: 'Andrew remembers this.', tags: ['phase5'] });
  });

  it('supports authorized update and delete while preserving the record contract', () => {
    const storage = new LocalStorageProvider();
    const created = saveMemory('old lesson', ['learning'], granted, storage);
    const updated = updateMemory(created.id, 'new lesson', ['learning', 'verified'], granted, storage);

    expect(updated.id).toBe(created.id);
    expect(updated.updatedAt).not.toBe(created.createdAt);
    expect(getMemories(storage)[0]?.text).toBe('new lesson');

    deleteMemory(created.id, granted, storage);
    expect(getMemories(storage)).toEqual([]);
  });

  it('rejects unauthorized mutation without changing persistent state', () => {
    const storage = new LocalStorageProvider();
    expect(() => saveMemory('must not persist', [], [], storage)).toThrow('Permission denied: memory.write');
    expect(getMemories(storage)).toEqual([]);
  });

  it('recovers safely from malformed persisted memory data', () => {
    const storage = new LocalStorageProvider();
    storage.set('iac33.memory', { corrupted: true });
    expect(getMemories(storage)).toEqual([]);
  });

  it('works with the storage fallback when browser localStorage is unavailable', () => {
    const storage = new LocalStorageProvider();
    const created = saveMemory('fallback memory', [], granted, storage);
    expect(getMemories(storage)[0]?.id).toBe(created.id);
  });
});
