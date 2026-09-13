export type HealthStatus = 'ok' | 'degraded' | 'failed';

export interface HealthCheck {
  readonly name: string;
  readonly status: HealthStatus;
  readonly latencyMs?: number;
  readonly detail?: string;
}

export interface StructuredHealth {
  readonly status: HealthStatus;
  readonly version: string;
  readonly uptimeMs: number;
  readonly timestamp: string;
  readonly checks: readonly HealthCheck[];
}

function normalizeStatus(checks: readonly HealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === 'failed')) return 'failed';
  if (checks.some((check) => check.status === 'degraded')) return 'degraded';
  return 'ok';
}

function normalizeLatency(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) throw new TypeError('invalid health latency');
  return Math.round(value * 100) / 100;
}

export function createHealthCheck(
  name: string,
  status: HealthStatus,
  latencyMs?: number,
  detail?: string,
): HealthCheck {
  const normalizedName = name.trim();
  if (!normalizedName) throw new TypeError('health check name is required');
  return Object.freeze({
    name: normalizedName,
    status,
    ...(normalizeLatency(latencyMs) === undefined ? {} : { latencyMs: normalizeLatency(latencyMs) }),
    ...(detail === undefined ? {} : { detail: detail.trim() }),
  });
}

export function createStructuredHealth(input: {
  readonly version: string;
  readonly uptimeMs: number;
  readonly checks?: readonly HealthCheck[];
  readonly timestamp?: string;
}): StructuredHealth {
  if (!input.version.trim()) throw new TypeError('health version is required');
  if (!Number.isFinite(input.uptimeMs) || input.uptimeMs < 0) throw new TypeError('invalid uptime');

  const checks = Object.freeze([...(input.checks ?? [])]);
  return Object.freeze({
    status: normalizeStatus(checks),
    version: input.version.trim(),
    uptimeMs: Math.round(input.uptimeMs),
    timestamp: input.timestamp ?? new Date().toISOString(),
    checks,
  });
}
