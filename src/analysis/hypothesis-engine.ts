export type EvidenceClass='fact'|'evidence'|'inference'|'hypothesis'|'speculation';
export interface ResearchItem { text:string; kind:EvidenceClass; reliability:number; sourceId?:string; }
export interface Hypothesis { statement:string; support:number; contradiction:number; confidence:number; status:'supported'|'mixed'|'weak'; }

export function evaluateHypothesis(statement:string, items:ResearchItem[]):Hypothesis {
 const relevant=items.filter(i=>i.reliability>0);
 const support=relevant.filter(i=>i.kind==='evidence'||i.kind==='fact').reduce((s,i)=>s+i.reliability,0);
 const contradiction=relevant.filter(i=>i.kind==='inference'||i.kind==='hypothesis').reduce((s,i)=>s+i.reliability,0);
 const total=Math.max(1,support+contradiction);
 const confidence=support/total;
 return {statement,support,contradiction,confidence,status:confidence>=.7?'supported':confidence>=.4?'mixed':'weak'};
}

export function researchPrinciples(){return [
 'Investigar desde múltiples marcos y no depender de una única corriente de conocimiento.',
 'Generar hipótesis propias a partir de patrones observables.',
 'Buscar activamente evidencia que contradiga cada hipótesis.',
 'Separar hechos, evidencia, inferencias, hipótesis y especulación.',
 'Actualizar conclusiones cuando aparezca nueva evidencia.'
] as const;}
