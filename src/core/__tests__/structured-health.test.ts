import { describe, expect, it } from 'vitest';
import { createHealthCheck, createStructuredHealth } from '../health/structured-health';

describe('structured health', () => {
  it('returns ok when all checks pass', () => {
    const health = createStructuredHealth({
      version: '2.0.0',
      uptimeMs: 1200,
      checks: [createHealthCheck('api', 'ok', 12.345)],
      timestamp: '2026-09-13T00:00:00.000Z',
    });
    expect(health.status).toBe('ok');
    expect(health.checks[0]?.latencyMs).toBe(12.35);
  });

  it('degrades and fails according to dependency checks', () => {
    const degraded = createStructuredHealth({
      version: '2.0.0',
      uptimeMs: 1,
      checks: [createHealthCheck('ai', 'degraded')],
    });
    const failed = createStructuredHealth({
      version: '2.0.0',
      uptimeMs: 1,
      checks: [createHealthCheck('api', 'ok'), createHealthCheck('storage', 'failed')],
    });
    expect(degraded.status).toBe('degraded');
    expect(failed.status).toBe('failed');
  });

  it('rejects invalid health input', () => {
    expect(() => createHealthCheck(' ', 'ok')).toThrow('health check name is required');
    expect(() => createHealthCheck('api', 'ok', -1)).toThrow('invalid health latency');
    expect(() => createStructuredHealth({ version: '', uptimeMs: 0 })).toThrow('health version is required');
  });
});
