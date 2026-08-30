export interface MemoryItem { id: string; text: string; tags: string[]; createdAt: string; updatedAt: string; }
const KEY='iac33.memory';
export function getMemories(): MemoryItem[]{ if(typeof localStorage==='undefined')return []; try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]} }
export function saveMemory(text:string,tags:string[]=[]):MemoryItem{const now=new Date().toISOString();const item={id:crypto.randomUUID(),text,tags,createdAt:now,updatedAt:now};localStorage.setItem(KEY,JSON.stringify([item,...getMemories()]));return item;}
export function deleteMemory(id:string){localStorage.setItem(KEY,JSON.stringify(getMemories().filter(x=>x.id!==id)));}
