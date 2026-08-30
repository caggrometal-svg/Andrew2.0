import type { AnalysisResult, EvidenceItem } from '../core/iac33-types';
import { analyzeCritically } from '../analysis/critical-engine';

export interface InvestigationInput {
  question: string;
  hypothesis: string;
  evidence: EvidenceItem[];
  alternatives: string[];
}

export function investigateHypothesis(input: InvestigationInput): AnalysisResult {
  const facts = input.evidence.filter((item) => item.kind === 'fact' || item.kind === 'source');
  const speculative = input.evidence.filter((item) => item.kind === 'speculation' || item.kind === 'hypothesis');
  const result = analyzeCritically({
    question: input.question,
    candidateConclusion: input.hypothesis,
    evidence: input.evidence,
    alternatives: input.alternatives,
  });
  return {
    ...result,
    conclusion: facts.length > 0
      ? `${input.hypothesis} — evaluar contra ${facts.length} elementos documentales y ${speculative.length} elementos hipotéticos.`
      : `${input.hypothesis} — no hay evidencia documental suficiente para tratarla como un hecho.`,
  };
}
