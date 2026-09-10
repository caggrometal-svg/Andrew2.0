export async function registerTelemetryRoutes(app) {
  app.post('/api/telemetry', {
    bodyLimit: 32 * 1024,
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['event'],
        additionalProperties: false,
        properties: {
          event: { type: 'string', minLength: 1, maxLength: 120 },
          timestamp: { type: 'string', maxLength: 64 },
          data: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (request, reply) => {
    request.log.info({ event: request.body.event, timestamp: request.body.timestamp }, 'telemetry');
    return reply.code(202).send({ ok: true });
  });
}
