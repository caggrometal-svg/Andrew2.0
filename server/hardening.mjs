const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export const applySecurityHeaders = (reply) => {
  for (const [name, value] of Object.entries(securityHeaders)) reply.header(name, value);
  return reply;
};

export const isSafeMethod = (method) => SAFE_METHODS.has(method);

export const createReadiness = ({ isReady }) => async (_request, reply) => {
  const ready = isReady();
  applySecurityHeaders(reply);
  return reply.code(ready ? 200 : 503).send({ ok: ready, status: ready ? 'ready' : 'not_ready', service: 'andrew2-backend' });
};

export const installGracefulShutdown = (app, { timeoutMs = 10000 } = {}) => {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'graceful shutdown started');
    const timer = setTimeout(() => process.exit(1), timeoutMs);
    timer.unref();
    try { await app.close(); clearTimeout(timer); process.exit(0); }
    catch (error) { app.log.error({ error }, 'graceful shutdown failed'); clearTimeout(timer); process.exit(1); }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
};
