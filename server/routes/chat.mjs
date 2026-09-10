import { createResponse } from '../openai.mjs';

const cleanMemory = (value) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string').map((item) => item.slice(0, 2000)).slice(0, 20)
  : [];

export async function registerChatRoutes(app) {
  app.post('/api/chat', {
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        additionalProperties: false,
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 12000 },
          memory: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 2000 } },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const result = await createResponse({
        message: request.body.message.trim(),
        memory: cleanMemory(request.body.memory),
      });

      return reply.send({
        ok: true,
        reply: result.text,
        responseId: result.responseId,
        model: result.model,
        learning: {
          eligible: true,
          source: 'assistant-response',
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({
        ok: false,
        error: 'AI_BACKEND_ERROR',
        message: 'No fue posible procesar la solicitud de Andrew.',
      });
    }
  });
}
