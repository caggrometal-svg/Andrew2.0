import crypto from 'node:crypto';
import { config } from '../config.mjs';

const OPENAI_VIDEOS = 'https://api.openai.com/v1/videos';
const MAX_PROMPT = 12000;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const jobs = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('INVALID_REFERENCE_IMAGE');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_REFERENCE_BYTES) throw new Error('REFERENCE_IMAGE_TOO_LARGE');
  return { mimeType: match[1], buffer };
}

async function createOpenAiVideo({ prompt, model, seconds, size, referenceImageDataUrl }) {
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  form.set('seconds', String(seconds));
  form.set('size', size);

  if (referenceImageDataUrl) {
    const { mimeType, buffer } = decodeDataUrl(referenceImageDataUrl);
    const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    form.set('input_reference', new Blob([buffer], { type: mimeType }), `reference.${extension}`);
  }

  const response = await fetch(OPENAI_VIDEOS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI video HTTP ${response.status}`);
  return data;
}

async function retrieveOpenAiVideo(videoId) {
  const response = await fetch(`${OPENAI_VIDEOS}/${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI video status HTTP ${response.status}`);
  return data;
}

export async function registerVideoGenerationRoutes(app) {
  app.post('/api/generate-video', {
    bodyLimit: 10 * 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        additionalProperties: false,
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: MAX_PROMPT },
          model: { type: 'string', enum: ['sora-2', 'sora-2-pro'] },
          seconds: { type: 'string', enum: ['4', '8', '12'] },
          size: { type: 'string', enum: ['720x1280', '1280x720', '1024x1792', '1792x1024'] },
          referenceImageDataUrl: { type: 'string', maxLength: 11000000 },
          conversationId: { type: 'string', maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body;
      const localId = crypto.randomUUID();
      const openai = await createOpenAiVideo({
        prompt: body.prompt.trim(),
        model: body.model || 'sora-2',
        seconds: body.seconds || '4',
        size: body.size || '720x1280',
        referenceImageDataUrl: body.referenceImageDataUrl,
      });
      jobs.set(localId, {
        id: localId,
        provider: 'openai',
        providerId: openai.id,
        status: openai.status || 'queued',
        progress: Number(openai.progress || 0),
        prompt: body.prompt.trim(),
        model: openai.model || body.model || 'sora-2',
        conversationId: body.conversationId || null,
        createdAt: Date.now(),
      });
      return reply.code(202).send({ ok: true, jobId: localId, status: jobs.get(localId).status, progress: 0 });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ ok: false, error: 'VIDEO_GENERATION_FAILED', message: error instanceof Error ? error.message : 'No fue posible iniciar la generación de video.' });
    }
  });

  app.get('/api/generate-video/:jobId', async (request, reply) => {
    const job = jobs.get(request.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'VIDEO_JOB_NOT_FOUND' });

    try {
      const remote = await retrieveOpenAiVideo(job.providerId);
      job.status = remote.status || job.status;
      job.progress = Number(remote.progress || (job.status === 'completed' ? 100 : 0));
      job.error = remote.error?.message || null;
      job.updatedAt = Date.now();
      return reply.send({
        ok: true,
        jobId: job.id,
        providerId: job.providerId,
        status: job.status,
        progress: job.progress,
        model: job.model,
        prompt: job.prompt,
        error: job.error,
        videoUrl: job.status === 'completed' ? `/api/generate-video/${job.id}/content` : null,
      });
    } catch (error) {
      request.log.warn({ err: error, jobId: job.id }, 'Video generation status lookup failed');
      return reply.send({ ok: true, jobId: job.id, status: job.status, progress: job.progress, model: job.model, prompt: job.prompt, error: null, videoUrl: null });
    }
  });

  app.get('/api/generate-video/:jobId/content', async (request, reply) => {
    const job = jobs.get(request.params.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'VIDEO_JOB_NOT_FOUND' });
    const remote = await retrieveOpenAiVideo(job.providerId);
    if (remote.status !== 'completed') return reply.code(409).send({ ok: false, error: 'VIDEO_NOT_READY', status: remote.status });

    const response = await fetch(`${OPENAI_VIDEOS}/${encodeURIComponent(job.providerId)}/content`, {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok || !response.body) return reply.code(502).send({ ok: false, error: 'VIDEO_CONTENT_UNAVAILABLE' });
    reply.header('Content-Type', response.headers.get('content-type') || 'video/mp4');
    reply.header('Cache-Control', 'private, max-age=300');
    return reply.send(response.body);
  });
}

export { sleep };
