import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { accessSync, constants, statSync } from 'node:fs';
import { config } from './config.mjs';
import { ffmpegPath, ffprobePath } from './media/ffmpeg-runtime.mjs';
import { registerChatRoutes } from './routes/chat.mjs';
import { registerGatewayRoutes } from './routes/gateway.mjs';
import { registerTelemetryRoutes } from './routes/telemetry.mjs';
import { registerMemoryRoutes } from './routes/memory.mjs';
import { registerVideoRoutes } from './media/video.mjs';
import { registerVideoGenerationRoutes } from './routes/video-generation.mjs';
import { createMemory, initializeMemoryStore, searchMemories } from './memory/memory-store.mjs';
import { initializeLearningStore, listAcceptedPatterns } from './learning/learning-store.mjs';
import { initializeSessionStore } from './session/session-store.mjs';
import { snapshotMetrics } from './observability/runtime-metrics.mjs';

const app = Fastify({ logger: true, bodyLimit: config.maxBodyBytes, trustProxy: true });
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
const configuredOrigins = new Set(config.corsOrigins);
await app.register(cors, { origin: (origin, callback) => { if (!origin || configuredOrigins.has(origin)) return callback(null, true); return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'), false); }, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'Origin', 'X-Requested-With', 'X-Andrew-User-Id', 'X-Andrew-Permissions', 'X-Chunk-Start', 'X-Chunk-End', 'X-Upload-Size'], exposedHeaders: ['Content-Type', 'Content-Length', 'Cache-Control', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'], credentials: false, preflight: true, optionsSuccessStatus: 204 });
await app.register(rateLimit, { global: false, max: 20, timeWindow: '1 minute', errorResponseBuilder: (_request, context) => ({ ok: false, error: 'RATE_LIMITED', message: `Demasiadas solicitudes. Intenta nuevamente en ${Math.ceil(context.ttl / 1000)} segundos.` }) });
const chatRateLimit = app.createRateLimit({ max: 20, timeWindow: '1 minute' });
const telemetryRateLimit = app.createRateLimit({ max: 60, timeWindow: '1 minute' });
const gatewayRateLimit = app.createRateLimit({ max: 30, timeWindow: '1 minute' });
app.addHook('onRequest', async (request, reply) => { if (request.method !== 'POST') return; const limiter = request.url === '/api/chat' ? chatRateLimit : request.url === '/api/telemetry' ? telemetryRateLimit : request.url.startsWith('/api/v1/sessions') ? gatewayRateLimit : undefined; if (!limiter) return; const result = await limiter(request); if (!result.isExceeded) return; return reply.code(429).send({ ok: false, error: 'RATE_LIMITED', message: `Demasiadas solicitudes. Intenta nuevamente en ${Math.ceil(result.ttl / 1000)} segundos.` }); });

const resolveUserId = (request) => { const header = request.headers['x-andrew-user-id']; const conversationId = request.body?.conversationId; return typeof header === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(header) ? header : typeof conversationId === 'string' ? `conversation:${conversationId}` : null; };
const shouldLearn = (message) => typeof message === 'string' && /\b(recuerda|recuérdame|recordar|mi nombre es|me llamo|prefiero|quiero que recuerdes|guarda esto|guárdalo)\b/i.test(message);
const extractIdentity = (message) => {
  if (typeof message !== 'string') return null;
  const match = message.match(/\b(?:mi nombre es|me llamo|soy)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,80})/i);
  if (!match) return null;
  const name = match[1].trim().replace(/[.,!?;:]+$/, '').replace(/\s+/g, ' ');
  if (!name || name.length > 80) return null;
  return `El usuario se llama ${name}.`;
};

app.addHook('preValidation', async (request) => {
  if (request.method !== 'POST' || request.url !== '/api/chat' || !request.body?.message || !request.body?.conversationId) return;
  const userId = resolveUserId(request);
  if (!userId) return;
  const memories = await searchMemories(userId, request.body.message, 8);
  const patterns = await listAcceptedPatterns(userId, 8);
  const persisted = memories.map((m) => `[${m.kind}|${m.importance}/5] ${m.text}`);
  const learned = patterns.map((p) => `[learned:${p.pattern_type}|${Number(p.confidence).toFixed(2)}] ${p.statement}`);
  const supplied = Array.isArray(request.body.memory) ? request.body.memory.filter((x) => typeof x === 'string').slice(0, 8) : [];
  request.body.memory = [...persisted, ...learned, ...supplied].slice(0, 20);
});

app.addHook('onSend', async (request, reply, payload) => {
  if (request.method !== 'POST' || request.url !== '/api/chat' || reply.statusCode !== 200) return payload;
  const message = request.body?.message;
  const userId = resolveUserId(request);
  if (!userId) return payload;
  if (!shouldLearn(message)) return payload;
  try {
    const identity = extractIdentity(message);
    if (identity) {
      await createMemory({ userId, conversationId: request.body.conversationId, kind: 'identity', text: identity, tags: ['identity', 'name', 'explicit'], importance: 5, source: 'explicit-user-instruction' });
    } else {
      await createMemory({ userId, conversationId: request.body.conversationId, kind: 'user_fact', text: String(message).trim().slice(0, 4000), tags: ['learning', 'explicit'], importance: 5, source: 'explicit-user-instruction' });
    }
  } catch (error) { request.log.error({ error }, 'persistent learning write failed'); }
  return payload;
});

const inspectBinary = (binaryPath) => { try { accessSync(binaryPath, constants.X_OK); const stat = statSync(binaryPath); return { available: true, executable: true, size: stat.size, path: binaryPath }; } catch (error) { return { available: false, executable: false, path: binaryPath || null, error: error instanceof Error ? error.message : String(error) }; } };
app.get('/health', async () => { const startedAt = process.hrtime.bigint(); const ffmpeg = inspectBinary(ffmpegPath); const ffprobe = inspectBinary(ffprobePath); const openaiConfigured = Boolean(config.openaiApiKey); const memoryConfigured = Boolean(process.env.DATABASE_URL?.trim()); const learningConfigured = memoryConfigured; const sessionConfigured = memoryConfigured; const system = { uptimeSeconds: Math.floor(process.uptime()), memory: process.memoryUsage(), node: process.version, pid: process.pid }; const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000; const healthy = openaiConfigured && memoryConfigured && ffmpeg.available && ffmpeg.executable && ffprobe.available && ffprobe.executable; return { ok: healthy, status: healthy ? 'healthy' : 'degraded', service: 'andrew2-backend', latencyMs: Number(latencyMs.toFixed(3)), checks: { server: 'ok', openaiApiKeyConfigured: openaiConfigured, memoryStoreConfigured: memoryConfigured, learningStoreConfigured: learningConfigured, sessionStoreConfigured: sessionConfigured, mediaRuntime: ffmpeg.available && ffmpeg.executable && ffprobe.available && ffprobe.executable ? 'ok' : 'degraded' }, environment: { port: config.port, host: config.host, corsOriginsConfigured: config.corsOrigins.length }, system, metrics: snapshotMetrics(), media: { video: 'chunked-temp', generation: 'openai-videos', ffmpeg, ffprobe } }; });

await initializeMemoryStore();
await initializeLearningStore();
await initializeSessionStore();
await registerGatewayRoutes(app);
await registerChatRoutes(app);
await registerTelemetryRoutes(app);
await registerMemoryRoutes(app);
await registerVideoRoutes(app);
await registerVideoGenerationRoutes(app);
app.setErrorHandler((error, request, reply) => { request.log.error(error); const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500; const code = status === 400 ? 'BAD_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : status === 429 ? 'RATE_LIMITED' : error.message === 'CORS_ORIGIN_NOT_ALLOWED' ? 'CORS_ORIGIN_NOT_ALLOWED' : 'INTERNAL_ERROR'; return reply.code(status).send({ ok: false, error: code, message: error.message || 'Error interno del servidor.' }); });
await app.listen({ port: config.port, host: config.host });
