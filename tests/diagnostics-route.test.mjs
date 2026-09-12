import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerDiagnosticsRoutes } from '../server/routes/diagnostics.mjs';
import { resetMetricsForTests } from '../server/observability/runtime-metrics.mjs';

describe('diagnostics metrics route', () => {
  const originalToken = process.env.DIAGNOSTICS_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.DIAGNOSTICS_TOKEN;
    else process.env.DIAGNOSTICS_TOKEN = originalToken;
    resetMetricsForTests();
  });

  it('rejects access when diagnostics token is not configured', async () => {
    delete process.env.DIAGNOSTICS_TOKEN;
    const app = Fastify();
    await registerDiagnosticsRoutes(app);
    const response = await app.inject({ method: 'GET', url: '/api/diagnostics/metrics' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'DIAGNOSTICS_AUTH_REQUIRED' });
    await app.close();
  });

  it('returns live metrics only with the configured bearer token', async () => {
    process.env.DIAGNOSTICS_TOKEN = 'test-diagnostics-token';
    const app = Fastify();
    await registerDiagnosticsRoutes(app);
    const unauthorized = await app.inject({ method: 'GET', url: '/api/diagnostics/metrics', headers: { authorization: 'Bearer wrong' } });
    expect(unauthorized.statusCode).toBe(401);
    const authorized = await app.inject({ method: 'GET', url: '/api/diagnostics/metrics', headers: { authorization: 'Bearer test-diagnostics-token' } });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json().ok).toBe(true);
    expect(authorized.json().metrics).toHaveProperty('rates');
    expect(authorized.headers['cache-control']).toBe('no-store');
    await app.close();
  });
});
