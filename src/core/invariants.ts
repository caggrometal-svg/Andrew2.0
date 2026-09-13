import type { AnalysisResult, EvidenceItem, ForecastScenario, Source } from './iac33-types';

export interface InvariantIssue {
  path: string;
  message: string;
}

const CONFIDENCES = new Set(['very-low', 'low', 'medium', 'high', 'very-high']);
const EVIDENCE_KINDS = new Set(['fact', 'source', 'indicator', 'hypothesis', 'speculation']);

function requiredString(value: unknown, path: string, issues: InvariantIssue[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) issues.push({ path, message: 'must be a non-empty string' });
}

function confidence(value: unknown, path: string, issues: InvariantIssue[]): void {
  if (typeof value !== 'string' || !CONFIDENCES.has(value)) issues.push({ path, message: 'invalid confidence value' });
}

export function validateSource(source: Source): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  requiredString(source.id, 'id', issues);
  requiredString(source.title, 'title', issues);
  requiredString(source.retrievedAt, 'retrievedAt', issues);
  confidence(source.reliability, 'reliability', issues);
  if (source.url !== undefined) {
    try { new URL(source.url); } catch { issues.push({ path: 'url', message: 'must be a valid URL' }); }
  }
  return issues;
}

export function validateEvidenceItem(item: EvidenceItem): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  requiredString(item.id, 'id', issues);
  requiredString(item.statement, 'statement', issues);
  if (!EVIDENCE_KINDS.has(item.kind)) issues.push({ path: 'kind', message: 'invalid evidence kind' });
  confidence(item.confidence, 'confidence', issues);
  if (!Array.isArray(item.sourceIds) || item.sourceIds.some((id) => typeof id !== 'string' || !id.trim())) {
    issues.push({ path: 'sourceIds', message: 'must contain only non-empty string ids' });
  }
  return issues;
}

export function validateAnalysisResult(result: AnalysisResult): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  requiredString(result.question, 'question', issues);
  requiredString(result.conclusion, 'conclusion', issues);
  confidence(result.confidence, 'confidence', issues);
  if (!Array.isArray(result.evidence)) issues.push({ path: 'evidence', message: 'must be an array' });
  else result.evidence.forEach((item, index) => validateEvidenceItem(item).forEach((issue) => issues.push({ ...issue, path: `evidence[${index}].${issue.path}` })));
  if (!Array.isArray(result.alternatives)) issues.push({ path: 'alternatives', message: 'must be an array' });
  if (!Array.isArray(result.contradictions)) issues.push({ path: 'contradictions', message: 'must be an array' });
  if (!Array.isArray(result.whatWouldChangeTheConclusion)) issues.push({ path: 'whatWouldChangeTheConclusion', message: 'must be an array' });
  requiredString(result.generatedAt, 'generatedAt', issues);
  return issues;
}

export function validateForecastScenario(scenario: ForecastScenario): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  requiredString(scenario.name, 'name', issues);
  requiredString(scenario.horizon, 'horizon', issues);
  requiredString(scenario.rationale, 'rationale', issues);
  requiredString(scenario.uncertainty, 'uncertainty', issues);
  if (!Number.isFinite(scenario.probability) || scenario.probability < 0 || scenario.probability > 1) {
    issues.push({ path: 'probability', message: 'must be a finite number between 0 and 1' });
  }
  return issues;
}

export function assertValid<T>(value: T, issues: InvariantIssue[]): T {
  if (issues.length) throw new Error(`Core invariant violation: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
  return value;
}
