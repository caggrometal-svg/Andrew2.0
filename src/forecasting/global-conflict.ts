import type { ForecastScenario } from '../core/iac33-types';
import { normalizeScenarios, rankScenarios } from './scenario-engine';

export interface ConflictIndicators {
  militaryTension: number;
  diplomaticTension: number;
  economicStress: number;
  escalationSignals: number;
}

export function forecastGlobalConflict(indicators: ConflictIndicators, horizon: string) {
  const values = Object.values(indicators).map((value) => Math.max(0, Math.min(100, value)));
  const pressure = values.reduce((sum, value) => sum + value, 0) / values.length;
  const scenarios: ForecastScenario[] = [
    { name: 'Continuidad / contención', probability: Math.max(1, 100 - pressure), horizon, rationale: 'Presión agregada inversamente ponderada.', uncertainty: 'Alta' },
    { name: 'Escalada regional', probability: Math.max(1, pressure), horizon, rationale: 'Señales agregadas de tensión y escalada.', uncertainty: 'Alta' },
    { name: 'Escalada internacional amplia', probability: Math.max(1, pressure * 0.35), horizon, rationale: 'Escenario de cola; requiere múltiples señales convergentes.', uncertainty: 'Muy alta' },
  ];
  return { pressure, scenarios: rankScenarios(normalizeScenarios(scenarios)), caveat: 'Estimación de escenarios, no predicción de guerra. Debe actualizarse con fuentes verificables y contexto temporal.' };
}
