import type { AnalysisEngine, AnalysisRequest } from '../core/types';
import { forecast, type ForecastDomain, type ForecastResult, type Signal } from './probabilistic';

function toDomain(domain: string): ForecastDomain {
  const allowed: ForecastDomain[] = ['earthquake', 'social', 'economic', 'conflict', 'weather', 'general'];
  return allowed.includes(domain as ForecastDomain) ? (domain as ForecastDomain) : 'general';
}

/** IAC33's default deterministic/probabilistic analysis adapter. */
export class IAC33AnalysisEngine implements AnalysisEngine<ForecastResult> {
  analyze(request: AnalysisRequest): ForecastResult {
    const signals: Signal[] = request.signals.map((signal) => ({
      name: signal.name,
      value: signal.value,
      ...(signal.weight !== undefined ? { weight: signal.weight } : {}),
    }));
    return forecast(toDomain(request.domain), signals, request.horizon);
  }
}

export const iac33AnalysisEngine = new IAC33AnalysisEngine();
