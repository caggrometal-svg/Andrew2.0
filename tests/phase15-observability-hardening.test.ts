import { describe, expect, it, beforeEach } from 'vitest';
import { incrementMetric, snapshotMetrics, resetMetricsForTests } from '../server/observability/runtime-metrics.mjs';

describe('Phase 15 observability hardening', () => {
  beforeEach(() => resetMetricsForTests());

  it('tracks bounded named counters and uptime', () => {
    incrementMetric('gateway.requests');
    incrementMetric('gateway.requests', 2);
    incrementMetric('gateway.requests', -10);
    incrementMetric('INVALID NAME!');
    const metrics = snapshotMetrics();
    expect(metrics.counters['gateway.requests']).toBe(3);
    expect(metrics.counters['INVALID NAME!']).toBeUndefined();
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
