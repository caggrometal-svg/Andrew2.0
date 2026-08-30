import type { AnalysisResult, EvidenceItem } from '../core/iac33-types';

export interface AnalysisInput {
  question: string;
  evidence: EvidenceItem[];
  candidateConclusion: string;
  alternatives?: string[];
}

export function analyzeCritically(input: AnalysisInput): AnalysisResult {
  const supporting = input.evidence.filter((e) => e.kind !== 'speculation');
  const contradictions = input.evidence
    .filter((e) => /contradice|contradicción|refuta|incompatible/i.test(e.statement))
    .map((e) => e.statement);

  const confidence = supporting.length === 0
    ? 'very-low'
    : supporting.length >= 5
      ? 'medium'
      : 'low';

  return {
    question: input.question,
    conclusion: input.candidateConclusion,
    confidence,
    evidence: input.evidence,
    alternatives: input.alternatives ?? [],
    contradictions,
    whatWouldChangeTheConclusion: [
      'Una fuente primaria fiable que contradiga la hipótesis.',
      'Nuevos datos reproducibles que reduzcan la incertidumbre.',
    ],
    generatedAt: new Date().toISOString(),
  };
}
