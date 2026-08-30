export type ForecastDomain = 'earthquake' | 'social' | 'economic' | 'conflict' | 'weather' | 'general';

export interface Signal {
  name: string;
  value: number;
  weight?: number;
  direction?: 'positive' | 'negative';
}

export interface ForecastScenario {
  label: string;
  probability: number;
  rationale: string[];
}

export interface ForecastResult {
  domain: ForecastDomain;
  horizon: string;
  confidence: 'low' | 'medium' | 'high';
  scenarios: ForecastScenario[];
  signals: Signal[];
  warning: string;
}

/**
 * Lightweight Bayesian-style scoring layer. It deliberately reports
 * uncertainty instead of pretending to predict deterministic outcomes.
 */
export function forecast(domain: ForecastDomain, signals: Signal[], horizon = '7 days'): ForecastResult {
  const normalized = signals.map((s) => ({
    ...s,
    weight: Math.max(0, s.weight ?? 1),
    value: Math.min(1, Math.max(0, s.value)),
  }));
  const totalWeight = normalized.reduce((sum, s) => sum + (s.weight ?? 1), 0) || 1;
  const raw = normalized.reduce((sum, s) => {
    const direction = s.direction === 'negative' ? -1 : 1;
    return sum + s.value * (s.weight ?? 1) * direction;
  }, 0) / totalWeight;
  const signalStrength = Math.min(1, Math.abs(raw));
  const primary = 0.34 + signalStrength * 0.42;
  const secondary = (1 - primary) * 0.62;
  const tertiary = 1 - primary - secondary;

  const scenarios: ForecastScenario[] = [
    { label: 'Escenario principal', probability: primary, rationale: normalized.slice(0, 3).map((s) => s.name) },
    { label: 'Escenario alternativo', probability: secondary, rationale: normalized.slice(3, 6).map((s) => s.name) },
    { label: 'Escenario de cola', probability: tertiary, rationale: ['incertidumbre residual', 'señales no observadas'] },
  ].map((s) => ({ ...s, probability: Math.round(s.probability * 1000) / 1000 }));

  return {
    domain,
    horizon,
    confidence: normalized.length >= 8 ? 'high' : normalized.length >= 4 ? 'medium' : 'low',
    scenarios,
    signals: normalized,
    warning: 'Pronóstico probabilístico: no es una predicción determinista. Los resultados dependen de la calidad, actualidad y cobertura de los datos.',
  };
}

export function earthquakeRisk(signals: Signal[], horizon = '30 days'): ForecastResult {
  return forecast('earthquake', signals, horizon);
}

export function socialEventRisk(signals: Signal[], horizon = '14 days'): ForecastResult {
  return forecast('social', signals, horizon);
}
