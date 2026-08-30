import { isAllowed, type Permission, type PermissionState } from './permissions';

export interface MemoryItem { id: string; text: string; tags: string[]; createdAt: string; updatedAt: string; }
const KEY='iac33.memory';

export function getMemories(): MemoryItem[]{
  if(typeof localStorage==='undefined')return [];
  try{
    const parsed=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch{return[];}
}

export function saveMemory(text:string,tags:string[]=[],permissions?:PermissionState[]):MemoryItem{
  requirePermission('memory.write',permissions);
  const now=new Date().toISOString();
  const item:MemoryItem={id:crypto.randomUUID(),text,tags,createdAt:now,updatedAt:now};
  localStorage.setItem(KEY,JSON.stringify([item,...getMemories()]));
  return item;
}

export function updateMemory(id:string,text:string,tags?:string[],permissions?:PermissionState[]):MemoryItem{
  requirePermission('memory.write',permissions);
  const now=new Date().toISOString();
  const current=getMemories();
  const existing=current.find((item)=>item.id===id);
  if(!existing)throw new Error(`Memory not found: ${id}`);
  const updated:MemoryItem={...existing,text,tags:tags??existing.tags,updatedAt:now};
  localStorage.setItem(KEY,JSON.stringify(current.map((item)=>item.id===id?updated:item)));
  return updated;
}

export function deleteMemory(id:string,permissions?:PermissionState[]):void{
  requirePermission('memory.write',permissions);
  localStorage.setItem(KEY,JSON.stringify(getMemories().filter((item)=>item.id!==id)));
}

function requirePermission(permission:Permission,state?:PermissionState[]):void{
  if(!isAllowed(permission,state))throw new Error(`Permission denied: ${permission}`);
}
