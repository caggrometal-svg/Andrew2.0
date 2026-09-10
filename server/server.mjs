import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.mjs';
import { registerChatRoutes } from './routes/chat.mjs';
import { registerVideoRoutes } from './media/video.mjs';

const app = Fastify({ logger: true, bodyLimit: config.maxBodyBytes });
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

await app.register(cors, {
  origin: config.corsOrigins.length ? config.corsOrigins : true,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
});

const buckets = new Map();
app.addHook('onRequest', async (request, reply) => {
  if (request.method === 'OPTIONS' || request.url === '/health') return;
  const now = Date.now();
  const key = request.ip;
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= config.rateLimitWindowMs) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > config.rateLimitMax) return reply.code(429).send({ ok: false, error: 'RATE_LIMITED' });
});

app.get('/health', async () => ({ ok: true, service: 'andrew2-backend', media: { video: 'chunked-temp' } }));
await registerChatRoutes(app);
await registerVideoRoutes(app);

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  return reply.code(status).send({ ok: false, error: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR' });
});

await app.listen({ port: config.port, host: config.host });
