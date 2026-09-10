import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { accessSync, constants, statSync } from 'node:fs';
import { config } from './config.mjs';
import { ffmpegPath, ffprobePath } from './media/ffmpeg-runtime.mjs';
import { registerChatRoutes } from './routes/chat.mjs';
import { registerVideoRoutes } from './media/video.mjs';
import { registerVideoGenerationRoutes } from './routes/video-generation.mjs';

const app = Fastify({ logger: true, bodyLimit: config.maxBodyBytes, trustProxy: true });
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

const configuredOrigins = new Set(config.corsOrigins);

await app.register(cors, {
  origin: (origin, callback) => {
    // Native Capacitor requests may omit Origin. Browser requests must match production origins exactly.
    if (!origin || configuredOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'Origin', 'X-Requested-With', 'X-Chunk-Start', 'X-Chunk-End', 'X-Upload-Size'],
  exposedHeaders: ['Content-Type', 'Content-Length', 'Cache-Control', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: false,
  preflight: true,
  optionsSuccessStatus: 204,
});

await app.register(rateLimit, {
  global: false,
  max: 20,
  timeWindow: '1 minute',
  errorResponseBuilder: (_request, context) => ({
    ok: false,
    error: 'RATE_LIMITED',
    message: `Demasiadas solicitudes. Intenta nuevamente en ${Math.ceil(context.ttl / 1000)} segundos.`,
  }),
});

const inspectBinary = (binaryPath) => {
  try {
    accessSync(binaryPath, constants.X_OK);
    const stat = statSync(binaryPath);
    return { available: true, executable: true, size: stat.size, path: binaryPath };
  } catch (error) {
    return { available: false, executable: false, path: binaryPath || null, error: error instanceof Error ? error.message : String(error) };
  }
};

app.get('/health', async () => {
  const startedAt = process.hrtime.bigint();
  const ffmpeg = inspectBinary(ffmpegPath);
  const ffprobe = inspectBinary(ffprobePath);
  const openaiConfigured = Boolean(config.openaiApiKey);
  const system = {
    uptimeSeconds: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    node: process.version,
    pid: process.pid,
  };
  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const healthy = openaiConfigured && ffmpeg.available && ffmpeg.executable && ffprobe.available && ffprobe.executable;

  return {
    ok: healthy,
    status: healthy ? 'healthy' : 'degraded',
    service: 'andrew2-backend',
    latencyMs: Number(latencyMs.toFixed(3)),
    checks: {
      server: 'ok',
      openaiApiKeyConfigured: openaiConfigured,
      mediaRuntime: ffmpeg.available && ffmpeg.executable && ffprobe.available && ffprobe.executable ? 'ok' : 'degraded',
    },
    environment: {
      port: config.port,
      host: config.host,
      corsOriginsConfigured: config.corsOrigins.length,
    },
    system,
    media: {
      video: 'chunked-temp',
      generation: 'openai-videos',
      ffmpeg,
      ffprobe,
    },
  };
});

await registerChatRoutes(app);
await registerVideoRoutes(app);
await registerVideoGenerationRoutes(app);

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  const code = status === 400 ? 'BAD_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : status === 429 ? 'RATE_LIMITED' : error.message === 'CORS_ORIGIN_NOT_ALLOWED' ? 'CORS_ORIGIN_NOT_ALLOWED' : 'INTERNAL_ERROR';
  return reply.code(status).send({ ok: false, error: code, message: error.message || 'Error interno del servidor.' });
});

await app.listen({ port: config.port, host: config.host });
