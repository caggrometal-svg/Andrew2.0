import type { Source } from './iac33-types';
import { addRecord } from './persistence';
const sources:Source[]=[];
export function registerSource(source:Source){sources.push(source);addRecord('source',source);return source}
export function listSources(){return [...sources]}
export function findSource(id:string){return sources.find(s=>s.id===id)}
