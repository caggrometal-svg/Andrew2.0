export interface EvidenceRecord { id:string; domain:string; sourceId:string; claim:string; observedAt:string; reliability:number; tags:string[]; }

export function normalizeEvidence(records:EvidenceRecord[]){
 return records.map(r=>({...r,reliability:Math.max(0,Math.min(1,r.reliability)),tags:[...new Set(r.tags)]}));
}

export function summarizeEvidence(records:EvidenceRecord[]){
 const normalized=normalizeEvidence(records);
 const confidence=normalized.length?normalized.reduce((sum,r)=>sum+r.reliability,0)/normalized.length:0;
 return {count:normalized.length,confidence,uncertainty:1-confidence,domains:[...new Set(normalized.map(r=>r.domain))]};
}
