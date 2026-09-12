import { snapshotMetrics } from '../observability/runtime-metrics.mjs';

function isAuthorized(request) {
  const configured = process.env.DIAGNOSTICS_TOKEN?.trim();
  if (!configured) return false;
  const header = request.headers.authorization;
  return typeof header === 'string' && header === `Bearer ${configured}`;
}

export async function registerDiagnosticsRoutes(app) {
  app.get('/api/diagnostics/metrics', async (request, reply) => {
    if (!isAuthorized(request)) {
      return reply.code(401).send({ ok: false, error: 'DIAGNOSTICS_AUTH_REQUIRED' });
    }
    reply.header('Cache-Control', 'no-store');
    return { ok: true, metrics: snapshotMetrics() };
  });
}
