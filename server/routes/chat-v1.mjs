const MAX_MESSAGES = 64;
const MAX_CONTENT = 32_000;

function validMessage(message) {
  return message && typeof message === 'object' && !Array.isArray(message)
    && ['system', 'user', 'assistant', 'tool'].includes(message.role)
    && typeof message.content === 'string' && message.content.length <= MAX_CONTENT;
}

function bodyObject(request) {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : null;
}

export async function registerChatV1Route(app, { provider }) {
  if (!provider || typeof provider.execute !== 'function') throw new TypeError('chat provider is required');

  app.post('/api/v1/chat', async (request, reply) => {
    const body = bodyObject(request);
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES || !messages.every(validMessage)) {
      return reply.code(400).send({ ok: false, error: 'invalid_messages' });
    }
    const model = body.model;
    if (model !== undefined && (typeof model !== 'string' || !model.trim() || model.length > 256)) {
      return reply.code(400).send({ ok: false, error: 'invalid_model' });
    }
    const timeoutMs = body.timeoutMs;
    if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)) {
      return reply.code(400).send({ ok: false, error: 'invalid_timeout' });
    }
    try {
      const result = await provider.execute({ messages, ...(model === undefined ? {} : { model }), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
      return { ok: true, provider: result.provider, model: result.model, content: result.content };
    } catch (error) {
      request.log?.error?.(error);
      return reply.code(502).send({ ok: false, error: error instanceof Error ? error.message : 'provider_error' });
    }
  });
}
