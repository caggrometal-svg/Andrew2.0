import { createResponse } from '../openai.mjs';

const cleanMemory = (value) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string').map((item) => item.slice(0, 2000)).slice(0, 20)
  : [];

const cleanAttachment = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if (value.type !== 'image' && value.type !== 'video') return undefined;
  if (typeof value.name !== 'string' || typeof value.mimeType !== 'string') return undefined;
  if (value.type === 'image' && typeof value.dataUrl !== 'string') return undefined;
  if (typeof value.dataUrl === 'string' && value.dataUrl.length > 8_000_000) throw new Error('La imagen adjunta supera el límite permitido.');
  return {
    type: value.type,
    name: value.name.slice(0, 200),
    mimeType: value.mimeType.slice(0, 100),
    ...(typeof value.dataUrl === 'string' ? { dataUrl: value.dataUrl } : {}),
  };
};

export async function registerChatRoutes(app) {
  app.post('/api/chat', {
    schema: {
      body: {
        type: 'object',
        required: ['message', 'conversationId'],
        additionalProperties: false,
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 12000 },
          conversationId: { type: 'string', minLength: 1, maxLength: 128 },
          memory: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 2000 } },
          attachment: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['image', 'video'] },
              name: { type: 'string', maxLength: 200 },
              mimeType: { type: 'string', maxLength: 100 },
              dataUrl: { type: 'string', maxLength: 8000000 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const attachment = cleanAttachment(request.body.attachment);
      const result = await createResponse({
        message: request.body.message.trim(),
        memory: cleanMemory(request.body.memory),
        attachment,
      });

      return reply.send({
        ok: true,
        conversationId: request.body.conversationId,
        reply: result.text,
        responseId: result.responseId,
        model: result.model,
        learning: {
          eligible: true,
          source: attachment ? `assistant-response-${attachment.type}` : 'assistant-response',
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({
        ok: false,
        error: 'AI_BACKEND_ERROR',
        message: error instanceof Error ? error.message : 'No fue posible procesar la solicitud de Andrew.',
      });
    }
  });
}
