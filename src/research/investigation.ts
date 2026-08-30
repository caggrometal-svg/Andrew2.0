import type { EvidenceItem, Source } from '../core/iac33-types';
import { sourceQuality } from '../core/connectors';

export interface InvestigationReport {
  title: string;
  question: string;
  facts: EvidenceItem[];
  hypotheses: EvidenceItem[];
  sources: Source[];
  weightedEvidence: number;
  verdict: 'supported' | 'mixed' | 'unsupported' | 'insufficient-data';
  nextChecks: string[];
}

export function buildInvestigationReport(title: string, question: string, evidence: EvidenceItem[], sources: Source[]): InvestigationReport {
  const facts = evidence.filter((e) => e.kind === 'fact' || e.kind === 'source');
  const hypotheses = evidence.filter((e) => e.kind === 'hypothesis' || e.kind === 'speculation');
  const weightedEvidence = facts.reduce((sum, item) => {
    const qualities = item.sourceIds.map((id) => sources.find((s) => s.id === id)).filter(Boolean).map((s) => sourceQuality(s!));
    return sum + (qualities.length ? Math.max(...qualities) : 0);
  }, 0);
  const verdict = facts.length === 0 ? 'insufficient-data' : weightedEvidence >= 3 ? 'supported' : 'mixed';
  return {
    title, question, facts, hypotheses, sources, weightedEvidence, verdict,
    nextChecks: ['Buscar fuentes primarias independientes.', 'Intentar encontrar evidencia que refute la hipótesis.', 'Comparar fechas, contexto y posibles sesgos de las fuentes.'],
  };
}
