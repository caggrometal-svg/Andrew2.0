import { createResponse } from '../openai.mjs';
import { getVideoFrames, getVideoUpload } from '../media/video.mjs';
import { processLearningObservation } from '../learning/learning-engine.mjs';
import { listAcceptedPatterns, recordObservation } from '../learning/learning-store.mjs';
import { planBridgeAction, queueBridgeAction } from '../bridge/bridge-controller.mjs';
import { createAvailabilityContract } from '../ai/andrew-provider-contract.mjs';

const MAX_IMAGE_DATA_URL = 7_000_000;
const MAX_HISTORY = 40;
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const cleanMemory = (value) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string').map((item) => item.slice(0, 2000)).slice(0, 20)
  : [];

const cleanHistory = (value) => Array.isArray(value)
  ? value.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map((item) => ({ role: item.role, content: item.content.slice(0, 12000) }))
    .slice(-MAX_HISTORY)
  : [];

const resolveUserId = (request) => {
  const header = request.headers['x-andrew-user-id'];
  if (typeof header === 'string' && USER_ID.test(header)) return header;
  return `conversation:${request.body.conversationId}`;
};

async function acceptedMemory(userId) {
  try {
    const patterns = await listAcceptedPatterns(userId, 20);
    return patterns.map((pattern) => `[${pattern.pattern_type}] ${String(pattern.statement).slice(0, 500)}`);
  } catch {
    return [];
  }
}

const cleanAttachment = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if (value.type !== 'image' && value.type !== 'video') return undefined;
  if (typeof value.name !== 'string' || typeof value.mimeType !== 'string') return undefined;
  if (value.type === 'image' && (typeof value.dataUrl !== 'string' || value.dataUrl.length > MAX_IMAGE_DATA_URL)) {
    throw new Error('La imagen adjunta supera el límite permitido.');
  }
  if (value.type === 'video' && (typeof value.uploadId !== 'string' || value.uploadId.length > 80)) {
    throw new Error('El video no tiene una carga temporal válida.');
  }
  return {
    type: value.type,
    name: value.name.slice(0, 200),
    mimeType: value.mimeType.slice(0, 100),
    ...(typeof value.dataUrl === 'string' ? { dataUrl: value.dataUrl } : {}),
    ...(typeof value.uploadId === 'string' ? { uploadId: value.uploadId } : {}),
    ...(Number.isInteger(value.size) ? { size: value.size } : {}),
  };
};

async function learnFromExchange(request, userText, assistantText) {
  try {
    const userId = resolveUserId(request);
    await recordObservation({ userId, conversationId: request.body.conversationId, userText, assistantText });
    await processLearningObservation({ userId, userText });
  } catch (error) {
    request.log.error({ error }, 'controlled learning observation failed');
  }
}

export async function registerChatRoutes(app) {
  app.post('/api/chat', {
    bodyLimit: 8 * 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['message', 'conversationId'],
        additionalProperties: false,
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 12000 },
          conversationId: { type: 'string', minLength: 1, maxLength: 128 },
          memory: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 2000 } },
          history: {
            type: 'array',
            maxItems: MAX_HISTORY,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 12000 },
              },
            },
          },
          attachment: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['image', 'video'] },
              name: { type: 'string', maxLength: 200 },
              mimeType: { type: 'string', maxLength: 100 },
              dataUrl: { type: 'string', maxLength: 7000000 },
              uploadId: { type: 'string', maxLength: 80 },
              size: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const attachment = cleanAttachment(request.body.attachment);
      let multimodalAttachment = attachment;

      if (attachment?.type === 'video') {
        const upload = await getVideoUpload(attachment.uploadId);
        if (!upload?.complete) throw new Error('El video todavía no está completo o expiró.');
        const frames = await getVideoFrames(attachment.uploadId);
        multimodalAttachment = {
          ...attachment,
          duration: upload.duration,
          frames: frames.map(({ index, timestamp, dataUrl }) => ({ index, timestamp, dataUrl })),
        };
      }

      const userText = request.body.message.trim();
      const userId = resolveUserId(request);
      const clientMemory = cleanMemory(request.body.memory);
      const persistentMemory = await acceptedMemory(userId);
      const memory = [...persistentMemory, ...clientMemory].slice(0, 20);
      const history = cleanHistory(request.body.history);
      const result = await createResponse({ message: userText, memory, history, attachment: multimodalAttachment });

      const plannedAction = planBridgeAction(userText);
      const bridge = plannedAction
        ? await queueBridgeAction({ userId, action: plannedAction })
        : { queued: false, error: 'no_bridge_action' };

      void learnFromExchange(request, userText, result.text);

      const availability = createAvailabilityContract({
        providerCount: Object.values(result.providerHealth?.providers || {}).filter((provider) => provider.configured).length,
        tierStates: result.providerHealth?.tiers || {},
      });

      return reply.send({
        ok: true,
        conversationId: request.body.conversationId,
        reply: result.text,
        responseId: result.responseId,
        model: result.model,
        provider: result.provider,
        latencyMs: result.latencyMs,
        bridgeProtocol: result.bridgeProtocol,
        modelMetadata: result.modelMetadata,
        availability,
        bridge: {
          queued: bridge.queued,
          ...(plannedAction ? { requested: plannedAction.command } : {}),
          ...(bridge.error ? { error: bridge.error } : {}),
          ...(bridge.command ? { commandId: bridge.command.id, expiresAt: bridge.command.expiresAt } : {}),
        },
        learning: {
          eligible: true,
          queued: true,
          source: attachment ? `assistant-response-${attachment.type}` : 'assistant-response',
        },
      });
    } catch (error) {
      request.log.error(error);
      const unavailable = error instanceof Error && error.code === 'AI_SERVICE_UNAVAILABLE';
      return reply.code(unavailable ? 503 : 502).send({
        ok: false,
        error: unavailable ? 'AI_SERVICE_UNAVAILABLE' : 'AI_BACKEND_ERROR',
        message: unavailable ? 'Servicio no disponible temporalmente' : error instanceof Error ? error.message : 'No fue posible procesar la solicitud de Andrew.',
      });
    }
  });
}
