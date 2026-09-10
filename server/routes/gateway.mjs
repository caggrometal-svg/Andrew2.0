import { createResponse } from '../openai.mjs';
import {
  appendSessionMessage,
  createSession,
  getSession,
  listSessionMessages,
  listSessions,
  setSessionResponseId,
} from '../session/session-store.mjs';

const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_HISTORY = 40;

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

export async function registerGatewayRoutes(app) {
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

      const result = await createResponse({
        message,
        memory: [],
        history: [...(history || []), { role: 'user', content: message }],
      });
      const assistantMessage = await appendSessionMessage(userId, sessionId, 'assistant', result.text);
      await setSessionResponseId(userId, sessionId, result.responseId);
      return reply.send({ ok: true, sessionId, message: assistantMessage, responseId: result.responseId, model: result.model });
    } catch (error) { return routeError(error, reply); }
  });
}
