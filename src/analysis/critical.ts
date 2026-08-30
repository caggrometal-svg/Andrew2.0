export interface Evidence {
  source: string;
  claim: string;
  reliability: number;
  agreesWith?: string[];
  contradicts?: string[];
}

export interface CriticalAssessment {
  facts: Evidence[];
  contradictions: Evidence[];
  hypotheses: Evidence[];
  overallConfidence: 'low' | 'medium' | 'high';
}

export function assessEvidence(evidence: Evidence[]): CriticalAssessment {
  const facts = evidence.filter((e) => e.reliability >= 0.75 && !e.contradicts?.length);
  const contradictions = evidence.filter((e) => (e.contradicts?.length ?? 0) > 0);
  const hypotheses = evidence.filter((e) => e.reliability < 0.75);
  const average = evidence.length
    ? evidence.reduce((sum, e) => sum + Math.max(0, Math.min(1, e.reliability)), 0) / evidence.length
    : 0;

  return {
    facts,
    contradictions,
    hypotheses,
    overallConfidence: average >= 0.8 ? 'high' : average >= 0.55 ? 'medium' : 'low',
  };
}
