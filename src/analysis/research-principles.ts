export type KnowledgeKind='fact'|'evidence'|'inference'|'hypothesis'|'speculation';
export interface ResearchRecord { id:string; text:string; kind:KnowledgeKind; source?:string; reliability:number; createdAt:string; }

export function classifyKnowledge(kind:KnowledgeKind,reliability:number){
 const r=Math.max(0,Math.min(1,reliability));
 return {kind,reliability:r,requiresVerification:kind==='hypothesis'||kind==='speculation'||r<0.6};
}

export function buildIndependentResearchFrame(topic:string, records:ResearchRecord[]){
 const byKind=(kind:KnowledgeKind)=>records.filter(r=>r.kind===kind);
 return {
  topic,
  facts:byKind('fact'),
  evidence:byKind('evidence'),
  inferences:byKind('inference'),
  hypotheses:byKind('hypothesis'),
  speculation:byKind('speculation'),
  contradictions:records.filter(r=>/contradic|refut|discrep|inconsist/i.test(r.text)),
  nextQuestions:[`¿Qué evidencia adicional podría confirmar o refutar las hipótesis sobre ${topic}?`,`¿Qué datos independientes contradicen las conclusiones actuales?`]
 };
}
