export type ClaimStatus='unverified'|'supported'|'contested'|'refuted';
export interface ClaimAssessment { claim:string; status:ClaimStatus; supporting:string[]; opposing:string[]; missingEvidence:string[]; confidence:number; }

/** Research framework: investigates unusual/conspiratorial claims without assuming they are true. */
export function assessClaim(claim:string, supporting:string[], opposing:string[], missingEvidence:string[]=[]):ClaimAssessment {
  const support=supporting.length;
  const opposition=opposing.length;
  const confidence=Math.max(0,Math.min(1,0.5+(support-opposition)*0.1-missingEvidence.length*0.05));
  const status:ClaimStatus = support===0&&opposition===0?'unverified':support>opposition*2?'supported':opposition>support*2?'refuted':'contested';
  return {claim,status,supporting,opposing,missingEvidence,confidence};
}
