import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.mjs';
import { registerChatRoutes } from './routes/chat.mjs';
import { registerVideoRoutes } from './media/video.mjs';
import { registerVideoGenerationRoutes } from './routes/video-generation.mjs';

const app = Fastify({ logger: true, bodyLimit: config.maxBodyBytes });
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

await app.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'Origin', 'X-Requested-With', 'X-Chunk-Start', 'X-Chunk-End', 'X-Upload-Size'],
  exposedHeaders: ['Content-Type', 'Content-Length', 'Cache-Control'],
  credentials: false,
  preflight: true,
  optionsSuccessStatus: 204,
});

const buckets = new Map();
app.addHook('onRequest', async (request, reply) => {
  if (request.method === 'OPTIONS' || request.url === '/health' || (request.method === 'PUT' && request.url.startsWith('/api/media/video/'))) return;
  const now = Date.now();
  const key = request.ip;
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= config.rateLimitWindowMs) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > config.rateLimitMax) return reply.code(429).send({ ok: false, error: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' });
});

app.get('/health', async () => ({ ok: true, service: 'andrew2-backend', media: { video: 'chunked-temp', ffmpeg: 'static-npm', generation: 'openai-videos' } }));
await registerChatRoutes(app);
await registerVideoRoutes(app);
await registerVideoGenerationRoutes(app);

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  const code = status === 400 ? 'BAD_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR';
  return reply.code(status).send({ ok: false, error: code, message: error.message || 'Error interno del servidor.' });
});

await app.listen({ port: config.port, host: config.host });
