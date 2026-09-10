import {
  clearMemories,
  createMemory,
  deleteMemory,
  getMemory,
  listMemories,
  searchMemories,
  updateMemory,
} from '../memory/memory-store.mjs';

const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function permission(request, required) {
  const granted = request.headers['x-andrew-permissions'];
  if (granted === 'admin' || granted === required || (required === 'memory.read' && granted === 'memory.write')) return true;
  return false;
}

function userId(request) {
  const value = request.headers['x-andrew-user-id'];
  if (typeof value !== 'string' || !USER_ID.test(value)) return null;
  return value;
}

function deny(reply) {
  return reply.code(403).send({ ok: false, error: 'PERMISSION_DENIED' });
}

export async function registerMemoryRoutes(app) {
  app.get('/api/memory', async (request, reply) => {
    if (!permission(request, 'memory.read')) return deny(reply);
    const uid = userId(request);
    if (!uid) return reply.code(400).send({ ok: false, error: 'USER_ID_REQUIRED' });
    const { q, limit } = request.query || {};
    const memories = q ? await searchMemories(uid, q, limit) : await listMemories(uid, limit);
    return reply.send({ ok: true, memories });
  });

  app.post('/api/memory', async (request, reply) => {
    if (!permission(request, 'memory.write')) return deny(reply);
    const uid = userId(request);
    if (!uid) return reply.code(400).send({ ok: false, error: 'USER_ID_REQUIRED' });
    const body = request.body || {};
    const memory = await createMemory({ ...body, userId: uid });
    return reply.code(201).send({ ok: true, memory });
  });

  app.put('/api/memory/:id', async (request, reply) => {
    if (!permission(request, 'memory.write')) return deny(reply);
    const uid = userId(request);
    if (!uid || !UUID.test(request.params.id)) return reply.code(400).send({ ok: false, error: 'INVALID_IDENTITY' });
    const memory = await updateMemory(uid, request.params.id, request.body || {});
    if (!memory) return reply.code(404).send({ ok: false, error: 'MEMORY_NOT_FOUND' });
    return reply.send({ ok: true, memory });
  });

  app.delete('/api/memory/:id', async (request, reply) => {
    if (!permission(request, 'memory.write')) return deny(reply);
    const uid = userId(request);
    if (!uid || !UUID.test(request.params.id)) return reply.code(400).send({ ok: false, error: 'INVALID_IDENTITY' });
    const deleted = await deleteMemory(uid, request.params.id);
    if (!deleted) return reply.code(404).send({ ok: false, error: 'MEMORY_NOT_FOUND' });
    return reply.send({ ok: true, deleted: true });
  });

  app.delete('/api/memory', async (request, reply) => {
    if (!permission(request, 'learning.clear')) return deny(reply);
    const uid = userId(request);
    if (!uid) return reply.code(400).send({ ok: false, error: 'USER_ID_REQUIRED' });
    const deleted = await clearMemories(uid);
    return reply.send({ ok: true, deleted });
  });

  app.get('/api/memory/:id', async (request, reply) => {
    if (!permission(request, 'memory.read')) return deny(reply);
    const uid = userId(request);
    if (!uid || !UUID.test(request.params.id)) return reply.code(400).send({ ok: false, error: 'INVALID_IDENTITY' });
    const memory = await getMemory(uid, request.params.id);
    if (!memory) return reply.code(404).send({ ok: false, error: 'MEMORY_NOT_FOUND' });
    return reply.send({ ok: true, memory });
  });
}
