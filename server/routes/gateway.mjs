import { createResponse } from '../openai.mjs';
import {
  appendSessionMessage,
  createSession,
  getSession,
  listSessionMessages,
  listSessions,
  setSessionResponseId,
} from '../session/session-store.mjs';
import { createMemory, searchMemories } from '../memory/memory-store.mjs';
import { listTools } from '../tools/tool-registry.ts';
import { routeTool } from '../tools/tool-router.ts';

const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TOOL_NAME = /^[A-Za-z0-9._:-]{1,80}$/;
const MEMORY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_HISTORY = 40;
const MAX_MEMORY = 8;
const TOOL_TIMEOUT_MS = 5000;
const TOOL_WRITE_ENABLED = process.env.ANDREW_TOOL_ALLOW_WRITE === 'true';
const TOOL_ALLOWED = ['calculator', 'memory'];

function resolveUserId(request) {
  const value = request.headers['x-andrew-user-id'];
  return typeof value === 'string' && USER_ID.test(value) ? value : null;
}

function resolveSessionId(request) {
  const value = request.params?.sessionId;
  return typeof value === 'string' && SESSION_ID.test(value) ? value : null;
}

function requireUser(request, reply) {
  const userId = resolveUserId(request);
  if (!userId) {
    void reply.code(401).send({ ok: false, error: 'UNAUTHENTICATED' });
    return null;
  }
  return userId;
}

function routeError(error, reply) {
  const message = error instanceof Error ? error.message : 'Gateway error';
  const clientErrors = new Set(['INVALID_USER_ID', 'INVALID_SESSION_ID', 'INVALID_MESSAGE_ROLE']);
  if (clientErrors.has(message) || error instanceof TypeError || error instanceof RangeError) {
    return reply.code(400).send({ ok: false, error: 'BAD_REQUEST', message });
  }
  return reply.code(502).send({ ok: false, error: 'GATEWAY_BACKEND_ERROR', message });
}

function memoryService() {
  return {
    read: async (userId, key) => {
      const memories = await searchMemories(userId, key, 20);
      const tagged = memories.find((memory) => memory.tags.includes(`tool:${key}`));
      if (!tagged) return null;
      try { return JSON.parse(tagged.text); } catch { return tagged.text; }
    },
    write: async (userId, key, value) => {
      const text = JSON.stringify(value);
      if (text.length > 3500) throw new RangeError('MEMORY_VALUE_TOO_LARGE');
      await createMemory({
        userId,
        kind: 'tool_state',
        text,
        tags: ['tool-state', `tool:${key}`],
        importance: 4,
        source: 'tool-router',
      });
    },
  };
}

export async function registerGatewayRoutes(app) {
  app.get('/api/v1/tools', async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    return reply.send({
      ok: true,
      writeEnabled: TOOL_WRITE_ENABLED,
      tools: listTools()
        .filter((tool) => TOOL_ALLOWED.includes(tool.name))
        .map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk, capability: tool.capability ?? null })),
    });
  });

  app.post('/api/v1/tools/execute', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['name', 'input'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          input: { type: 'object', additionalProperties: true },
          conversationId: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
    if (!TOOL_NAME.test(name) || !TOOL_ALLOWED.includes(name)) {
      return reply.code(403).send({ ok: false, error: 'TOOL_NOT_ALLOWED', tool: name || null });
    }
    const conversationId = typeof request.body.conversationId === 'string' ? request.body.conversationId : `tool:${name}`;
    const context = {
      userId,
      conversationId,
      requestId: request.id,
      memory: memoryService(),
    };
    const result = await routeTool(name, request.body.input, context, {
      allowed: TOOL_ALLOWED,
      allowWrite: TOOL_WRITE_ENABLED,
    }, TOOL_TIMEOUT_MS);
    return reply.code(result.ok ? 200 : 403).send({ ok: result.ok, tool: name, verified: result.verified, data: result.data, error: result.error, metadata: result.metadata });
  });

  app.get('/api/v1/sessions', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } } } },
  }, async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    try { return reply.send({ ok: true, sessions: await listSessions(userId, request.query.limit) }); }
    catch (error) { return routeError(error, reply); }
  });

  app.post('/api/v1/sessions', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string', minLength: 1, maxLength: 128 }, title: { type: 'string', maxLength: 160 } } } },
  }, async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    try {
      const session = await createSession(userId, request.body.sessionId, request.body.title);
      return reply.code(201).send({ ok: true, session });
    } catch (error) { return routeError(error, reply); }
  });

  app.get('/api/v1/sessions/:sessionId', async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const sessionId = resolveSessionId(request);
    if (!sessionId) return reply.code(400).send({ ok: false, error: 'INVALID_SESSION_ID' });
    try {
      const session = await getSession(userId, sessionId);
      if (!session) return reply.code(404).send({ ok: false, error: 'SESSION_NOT_FOUND' });
      const messages = await listSessionMessages(userId, sessionId, MAX_HISTORY);
      return reply.send({ ok: true, session, messages });
    } catch (error) { return routeError(error, reply); }
  });

  app.post('/api/v1/sessions/:sessionId/messages', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['message'],
        properties: { message: { type: 'string', minLength: 1, maxLength: 12000 } },
      },
    },
  }, async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const sessionId = resolveSessionId(request);
    if (!sessionId) return reply.code(400).send({ ok: false, error: 'INVALID_SESSION_ID' });
    const message = request.body.message.trim();
    try {
      const session = await getSession(userId, sessionId);
      if (!session) return reply.code(404).send({ ok: false, error: 'SESSION_NOT_FOUND' });
      const history = await listSessionMessages(userId, sessionId, MAX_HISTORY);
      const userMessage = await appendSessionMessage(userId, sessionId, 'user', message);
      if (!userMessage) return reply.code(404).send({ ok: false, error: 'SESSION_NOT_FOUND' });

      const memories = await searchMemories(userId, message, MAX_MEMORY);
      const memoryContext = memories.map((memory) => {
        const kind = memory.kind ? `[${memory.kind}] ` : '';
        return `${kind}${memory.text}`;
      });
      const result = await createResponse({ message, memory: memoryContext, history: history || [] });
      const assistantMessage = await appendSessionMessage(userId, sessionId, 'assistant', result.text);
      await setSessionResponseId(userId, sessionId, result.responseId);
      return reply.send({ ok: true, sessionId, message: assistantMessage, responseId: result.responseId, model: result.model, memoryUsed: memories.length });
    } catch (error) { return routeError(error, reply); }
  });
}
