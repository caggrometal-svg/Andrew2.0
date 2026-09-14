import { requireAuthorization } from './authorization';
import type { PermissionState } from './permissions';
import { LocalStorageProvider, type StorageProvider } from '../storage/storage-provider';

export interface MemoryItem {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const KEY = 'iac33.memory';
const MAX_MEMORIES = 5000;
const MAX_TEXT_LENGTH = 20_000;
const MAX_TAG_LENGTH = 100;
const defaultStorage: StorageProvider = new LocalStorageProvider();

export function getMemories(storage: StorageProvider = defaultStorage): MemoryItem[] {
  const parsed = storage.get<unknown>(KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isMemoryItem).slice(0, MAX_MEMORIES);
}

export function saveMemory(
  text: string,
  tags: string[] = [],
  permissions?: PermissionState[],
  storage: StorageProvider = defaultStorage,
): MemoryItem {
  requireAuthorization('memory.write', permissions);
  validateMemoryInput(text, tags);
  const now = new Date().toISOString();
  const item: MemoryItem = { id: crypto.randomUUID(), text, tags: [...tags], createdAt: now, updatedAt: now };
  storage.set(KEY, [item, ...getMemories(storage)].slice(0, MAX_MEMORIES));
  return item;
}

export function updateMemory(
  id: string,
  text: string,
  tags?: string[],
  permissions?: PermissionState[],
  storage: StorageProvider = defaultStorage,
): MemoryItem {
  requireAuthorization('memory.write', permissions);
  validateId(id);
  validateMemoryInput(text, tags);
  const current = getMemories(storage);
  const existing = current.find((item) => item.id === id);
  if (!existing) throw new Error(`Memory not found: ${id}`);
  const createdAtMs = Date.parse(existing.createdAt);
  const nowMs = Math.max(Date.now(), Number.isNaN(createdAtMs) ? Date.now() : createdAtMs + 1);
  const updated: MemoryItem = {
    ...existing,
    text,
    tags: tags ? [...tags] : existing.tags,
    updatedAt: new Date(nowMs).toISOString(),
  };
  storage.set(KEY, current.map((item) => (item.id === id ? updated : item)));
  return updated;
}

export function deleteMemory(
  id: string,
  permissions?: PermissionState[],
  storage: StorageProvider = defaultStorage,
): void {
  requireAuthorization('memory.write', permissions);
  validateId(id);
  storage.set(KEY, getMemories(storage).filter((item) => item.id !== id));
}

function validateMemoryInput(text: string, tags?: string[]): void {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Memory text is required');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Memory text exceeds maximum length');
  const normalizedTags = tags ?? [];
  if (normalizedTags.length > 50 || normalizedTags.some((tag) => typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH || !tag.trim())) {
    throw new Error('Invalid memory tags');
  }
}

function validateId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Memory id is required');
}

function isMemoryItem(value: unknown): value is MemoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MemoryItem>;
  return typeof item.id === 'string'
    && typeof item.text === 'string'
    && Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string')
    && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string';
}
