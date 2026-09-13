import { describe, expect, it } from 'vitest';
import { validateAnalysisResult, validateEvidenceItem, validateForecastScenario, validateSource } from './invariants';

const source = { id: 'src-1', title: 'Official source', retrievedAt: '2026-09-13T00:00:00.000Z', reliability: 'high' as const, url: 'https://example.com/source' };
const evidence = { id: 'ev-1', kind: 'fact' as const, statement: 'A verified fact', sourceIds: ['src-1'], confidence: 'high' as const };

describe('core invariants', () => {
  it('accepts a valid source', () => expect(validateSource(source)).toEqual([]));
  it('rejects malformed source URLs', () => expect(validateSource({ ...source, url: 'not-a-url' })).toHaveLength(1));
  it('rejects invalid evidence references', () => expect(validateEvidenceItem({ ...evidence, sourceIds: [''] })).toHaveLength(1));
  it('rejects probabilities outside the closed interval [0,1]', () => expect(validateForecastScenario({ name: 'test', probability: 1.1, horizon: 'short', rationale: 'test', uncertainty: 'test' })).toHaveLength(1));
  it('validates the full analysis contract recursively', () => {
    const result = {
      question: 'What happened?',
      conclusion: 'Supported conclusion',
      confidence: 'high' as const,
      evidence: [evidence],
      alternatives: ['alternative'],
      contradictions: [],
      whatWouldChangeTheConclusion: ['new evidence'],
      generatedAt: '2026-09-13T00:00:00.000Z',
    };
    expect(validateAnalysisResult(result)).toEqual([]);
    expect(validateAnalysisResult({ ...result, evidence: [{ ...evidence, confidence: 'invalid' as never }] })).toHaveLength(1);
  });
});
