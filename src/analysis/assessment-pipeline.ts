import { assessEvidence, type Evidence, type CriticalAssessment } from './critical';
import { forecast, type ForecastDomain, type Signal, type ForecastResult } from './probabilistic';

export interface AssessmentInput { domain: ForecastDomain; signals: Signal[]; evidence: Evidence[]; horizon?: string; }
export interface AssessmentOutput { forecast: ForecastResult; critical: CriticalAssessment; overallConfidence: 'low'|'medium'|'high'; notes: string[]; }

export function runAssessment(input: AssessmentInput): AssessmentOutput {
  const critical=assessEvidence(input.evidence);
  const forecastResult=forecast(input.domain,input.signals,input.horizon);
  const levels=['low','medium','high'] as const;
  const level=Math.min(levels.indexOf(critical.overallConfidence),levels.indexOf(forecastResult.confidence));
  const notes=[
    'Las probabilidades son escenarios, no predicciones deterministas.',
    'La calidad del resultado depende de la cobertura, actualidad y confiabilidad de las fuentes.'
  ];
  if(critical.contradictions.length) notes.push('Existen evidencias contradictorias que deben revisarse.');
  return {forecast:forecastResult,critical,overallConfidence:levels[level],notes};
}
