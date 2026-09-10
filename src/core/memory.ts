import { isAllowed, type Permission, type PermissionState } from './permissions';
import { LocalStorageProvider, type StorageProvider } from '../storage/storage-provider';

export interface MemoryItem { id: string; text: string; tags: string[]; createdAt: string; updatedAt: string; }
const KEY='iac33.memory';
const defaultStorage: StorageProvider = new LocalStorageProvider();

export function getMemories(storage: StorageProvider = defaultStorage): MemoryItem[]{
  const parsed = storage.get<unknown>(KEY);
  return Array.isArray(parsed) ? parsed as MemoryItem[] : [];
}

export function saveMemory(text:string,tags:string[]=[],permissions?:PermissionState[],storage:StorageProvider = defaultStorage):MemoryItem{
  requirePermission('memory.write',permissions);
  const now=new Date().toISOString();
  const item:MemoryItem={id:crypto.randomUUID(),text,tags,createdAt:now,updatedAt:now};
  storage.set(KEY,[item,...getMemories(storage)]);
  return item;
}

export function updateMemory(id:string,text:string,tags?:string[],permissions?:PermissionState[],storage:StorageProvider = defaultStorage):MemoryItem{
  requirePermission('memory.write',permissions);
  const now=new Date().toISOString();
  const current=getMemories(storage);
  const existing=current.find((item)=>item.id===id);
  if(!existing)throw new Error(`Memory not found: ${id}`);
  const updated:MemoryItem={...existing,text,tags:tags??existing.tags,updatedAt:now};
  storage.set(KEY,current.map((item)=>item.id===id?updated:item));
  return updated;
}

export function deleteMemory(id:string,permissions?:PermissionState[],storage:StorageProvider = defaultStorage):void{
  requirePermission('memory.write',permissions);
  storage.set(KEY,getMemories(storage).filter((item)=>item.id!==id));
}

function requirePermission(permission:Permission,state?:PermissionState[]):void{
  if(!isAllowed(permission,state))throw new Error(`Permission denied: ${permission}`);
}
