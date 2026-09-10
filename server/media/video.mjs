import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(process.env.TMPDIR || '/tmp', 'andrew2-media');
const DEFAULT_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const TTL_MS = 60 * 60 * 1000;
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
    return reply.send({ ok: true, uploadId: upload.id, received: upload.received, complete: upload.received === upload.size, mimeType: upload.mimeType, name: upload.name });
  });

  app.get('/api/media/video/:uploadId', async (request, reply) => {
    const upload = uploads.get(request.params.uploadId);
    if (!upload) return reply.code(404).send({ ok: false, error: 'UPLOAD_NOT_FOUND' });
    return reply.send({ ok: true, uploadId: upload.id, received: upload.received, size: upload.size, complete: upload.received === upload.size, mimeType: upload.mimeType, name: upload.name });
  });
}
