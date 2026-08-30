export interface IAC33Record { id:string; kind:'memory'|'source'|'investigation'|'activity'; data:unknown; createdAt:string; }
const KEY='iac33.records';
export function records():IAC33Record[]{if(typeof localStorage==='undefined')return[];try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
export function addRecord(kind:IAC33Record['kind'],data:unknown):IAC33Record{const r={id:crypto.randomUUID(),kind,data,createdAt:new Date().toISOString()};if(typeof localStorage!=='undefined')localStorage.setItem(KEY,JSON.stringify([r,...records()]));return r}
export function clearRecords(){if(typeof localStorage!=='undefined')localStorage.removeItem(KEY)}
