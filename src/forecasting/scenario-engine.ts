import type { ForecastScenario } from '../core/iac33-types';

export function normalizeScenarios(scenarios: ForecastScenario[]): ForecastScenario[] {
  if (!scenarios.length) return [];
  const total = scenarios.reduce((sum, item) => sum + Math.max(0, item.probability), 0);
  if (total === 0) return scenarios.map((item) => ({ ...item, probability: 0 }));
  return scenarios.map((item) => ({
    ...item,
    probability: Math.round((Math.max(0, item.probability) / total) * 10000) / 100,
  }));
}

export function rankScenarios(scenarios: ForecastScenario[]): ForecastScenario[] {
  return [...scenarios].sort((a, b) => b.probability - a.probability);
}
