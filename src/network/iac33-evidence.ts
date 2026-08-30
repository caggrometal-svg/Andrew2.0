import type { EvidenceRef } from '../core/iac33-kernel';
import { fetchJson, type WebSource } from './publicWeb';

export interface ObservedWebEvidence<T = unknown> extends EvidenceRef {
  kind: 'fact' | 'evidence';
  source: string;
  sourceUrl: string;
  observedAt: string;
  data: T;
}

export async function collectPublicEvidence<T>(source: WebSource, timeoutMs = 10000): Promise<ObservedWebEvidence<T>> {
  const observedAt = new Date().toISOString();
  const data = await fetchJson<T>(source.url, timeoutMs);
  return {
    id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'evidence',
    source: source.name,
    sourceUrl: source.url,
    observedAt,
    data,
  };
}

export function evidenceToRef(evidence: ObservedWebEvidence): EvidenceRef {
  return {
    id: evidence.id,
    kind: evidence.kind,
    source: evidence.sourceUrl,
    observedAt: evidence.observedAt,
  };
}
