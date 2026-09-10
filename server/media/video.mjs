import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.join(process.env.TMPDIR || '/tmp', 'andrew2-media');
const DEFAULT_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const TTL_MS = 60 * 60 * 1000;
const MAX_FRAMES = 6;
const FRAME_WIDTH = 768;
const uploads = new Map();

const safeName = (value) => String(value || 'video').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

async function ensureRoot() { await fs.mkdir(ROOT, { recursive: true }); }

async function cleanupExpired() {
  const now = Date.now();
  for (const [id, upload] of uploads) {
    if (now - upload.updatedAt > TTL_MS) {
      uploads.delete(id);
      await fs.rm(upload.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function ffprobeDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Unable to determine video duration');
  return duration;
}

async function extractFrame(filePath, timestamp, outputPath) {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-ss', timestamp.toFixed(3), '-i', filePath,
    '-frames:v', '1', '-vf', `scale=${FRAME_WIDTH}:-2`, '-q:v', '5', '-y', outputPath,
  ], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const buffer = await fs.readFile(outputPath);
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

export async function extractVideoFrames(uploadId) {
  const upload = uploads.get(uploadId);
  if (!upload) throw new Error('UPLOAD_NOT_FOUND');
  if (upload.received !== upload.size) throw new Error('VIDEO_UPLOAD_INCOMPLETE');
  if (upload.frames?.length) return upload.frames;

  const duration = await ffprobeDuration(upload.filePath);
  const count = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(duration / 10)));
  const timestamps = Array.from({ length: count }, (_, index) => {
    if (count === 1) return Math.max(0, duration * 0.5);
    return Math.min(duration - 0.05, duration * (index / (count - 1)));
  });

  const frameDir = path.join(upload.dir, 'frames');
  await fs.mkdir(frameDir, { recursive: true });
  const frames = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const framePath = path.join(frameDir, `frame-${String(index + 1).padStart(2, '0')}.jpg`);
    try {
      const dataUrl = await extractFrame(upload.filePath, timestamps[index], framePath);
      frames.push({ index: index + 1, timestamp: timestamps[index], dataUrl });
    } catch (error) {
      if (index === 0) throw error;
    }
  }
  if (!frames.length) throw new Error('VIDEO_FRAME_EXTRACTION_FAILED');
  upload.frames = frames;
  upload.duration = duration;
  upload.updatedAt = Date.now();
  return frames;
}

export async function getVideoFrames(uploadId) {
  const upload = uploads.get(uploadId);
  if (!upload) throw new Error('UPLOAD_NOT_FOUND');
  if (upload.received !== upload.size) throw new Error('VIDEO_UPLOAD_INCOMPLETE');
  return extractVideoFrames(uploadId);
}

export async function getVideoUpload(uploadId) {
  const upload = uploads.get(uploadId);
  if (!upload) return null;
  return {
    uploadId: upload.id,
    received: upload.received,
    size: upload.size,
    complete: upload.received === upload.size,
    mimeType: upload.mimeType,
    name: upload.name,
    duration: upload.duration || null,
    frameCount: upload.frames?.length || 0,
  };
}

export async function registerVideoRoutes(app) {
  await ensureRoot();

  app.post('/api/media/video/init', {
    schema: {
      body: {
        type: 'object', required: ['name', 'mimeType', 'size'], additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          mimeType: { type: 'string', pattern: '^video/' },
          size: { type: 'integer', minimum: 1, maximum: MAX_VIDEO_BYTES },
          chunkSize: { type: 'integer', minimum: 262144, maximum: MAX_CHUNK_BYTES },
        },
      },
    },
  }, async (request, reply) => {
    await cleanupExpired();
    const id = crypto.randomUUID();
    const dir = path.join(ROOT, id);
    await fs.mkdir(dir, { recursive: true });
    const upload = { id, dir, filePath: path.join(dir, safeName(request.body.name)), name: safeName(request.body.name), mimeType: request.body.mimeType, size: request.body.size, chunkSize: request.body.chunkSize || DEFAULT_CHUNK_BYTES, received: 0, updatedAt: Date.now() };
    uploads.set(id, upload);
    return reply.code(201).send({ ok: true, uploadId: id, chunkSize: upload.chunkSize, expiresInMs: TTL_MS });
  });

  app.put('/api/media/video/:uploadId', { bodyLimit: MAX_CHUNK_BYTES }, async (request, reply) => {
    const upload = uploads.get(request.params.uploadId);
    if (!upload) return reply.code(404).send({ ok: false, error: 'UPLOAD_NOT_FOUND' });
    const start = Number(request.headers['x-chunk-start']);
    const end = Number(request.headers['x-chunk-end']);
    const total = Number(request.headers['x-upload-size']);
    const chunk = request.body;
    if (!Buffer.isBuffer(chunk) || !Number.isInteger(start) || !Number.isInteger(end) || total !== upload.size || start !== upload.received || end !== start + chunk.length || chunk.length > MAX_CHUNK_BYTES) {
      return reply.code(400).send({ ok: false, error: 'INVALID_VIDEO_CHUNK' });
    }
    const handle = await fs.open(upload.filePath, upload.received === 0 ? 'w' : 'r+');
    try { await handle.write(chunk, 0, chunk.length, start); } finally { await handle.close(); }
    upload.received = end;
    upload.updatedAt = Date.now();

    let analysisReady = false;
    if (upload.received === upload.size) {
      try {
        await extractVideoFrames(upload.id);
        analysisReady = true;
      } catch (error) {
        app.log.warn({ err: error, uploadId: upload.id }, 'Video frame extraction unavailable');
      }
    }

    return reply.send({ ok: true, uploadId: upload.id, received: upload.received, complete: upload.received === upload.size, analysisReady, duration: upload.duration || null, frameCount: upload.frames?.length || 0, mimeType: upload.mimeType, name: upload.name });
  });

  app.get('/api/media/video/:uploadId', async (request, reply) => {
    const upload = await getVideoUpload(request.params.uploadId);
    if (!upload) return reply.code(404).send({ ok: false, error: 'UPLOAD_NOT_FOUND' });
    return reply.send({ ok: true, ...upload });
  });
}
