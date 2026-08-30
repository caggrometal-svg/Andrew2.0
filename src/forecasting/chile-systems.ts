import type { ForecastScenario } from '../core/iac33-types';
import { normalizeScenarios, rankScenarios } from './scenario-engine';

export interface Observation {
  timestamp: string;
  value: number;
  source: string;
}

export interface ChileForecast {
  domain: 'seismic' | 'rainfall';
  region: string;
  horizon: string;
  scenarios: ForecastScenario[];
  caveat: string;
}

function buildScenarios(domain: ChileForecast['domain'], observations: Observation[]): ForecastScenario[] {
  if (!observations.length) {
    return [{ name: 'Sin datos suficientes', probability: 0, horizon: 'N/A', rationale: 'Se requieren observaciones verificables.', uncertainty: 'Muy alta' }];
  }
  const recent = observations.slice(-10);
  const mean = recent.reduce((sum, item) => sum + item.value, 0) / recent.length;
  const variance = recent.reduce((sum, item) => sum + Math.pow(item.value - mean, 2), 0) / recent.length;
  const volatility = Math.sqrt(variance);
  const threshold = domain === 'seismic' ? mean + volatility : mean + volatility;
  const label = domain === 'seismic' ? 'Actividad relativa elevada' : 'Precipitación relativa elevada';
  return rankScenarios(normalizeScenarios([
    { name: label, probability: Math.max(1, mean + volatility), horizon: 'Próximo horizonte de datos', rationale: `Indicador normalizado=${threshold.toFixed(2)}; requiere validación con datos oficiales.`, uncertainty: 'Alta; no constituye predicción determinista.' },
    { name: 'Actividad dentro del rango observado', probability: Math.max(1, mean), horizon: 'Próximo horizonte de datos', rationale: 'Escenario base respecto de las observaciones recientes.', uncertainty: 'Alta' },
    { name: 'Actividad inferior al rango reciente', probability: Math.max(1, mean - volatility), horizon: 'Próximo horizonte de datos', rationale: 'Escenario alternativo para mantener incertidumbre explícita.', uncertainty: 'Alta' },
  ]));
}

export function forecastChile(domain: ChileForecast['domain'], region: string, horizon: string, observations: Observation[]): ChileForecast {
  return {
    domain,
    region,
    horizon,
    scenarios: buildScenarios(domain, observations),
    caveat: domain === 'seismic'
      ? 'El módulo estima escenarios estadísticos a partir de datos suministrados. No predice terremotos individuales, hora, lugar o magnitud futura.'
      : 'El módulo genera escenarios estadísticos. La previsión operativa debe contrastarse con servicios meteorológicos oficiales y observaciones actuales.',
  };
}
