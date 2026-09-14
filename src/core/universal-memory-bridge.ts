import {
  extractExplicitUserName,
  getUniversalMemory,
  hydrateUniversalMemory,
  isNameRecallQuery,
  isUniversalMemoryCommand,
} from './universal-memory';

const PATCHED_FLAG = '__andrewUniversalMemoryFetchPatched';

type ChatBody = { message?: unknown; conversationId?: unknown };

function chatResponse(conversationId: string, reply: string): Response {
  return new Response(JSON.stringify({
    ok: true,
    conversationId,
    reply,
    responseId: `local-memory-${Date.now().toString(36)}`,
    model: 'local-memory',
    learning: { eligible: false, source: 'local-universal-memory' },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isChatRequest(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    return new URL(url, window.location.origin).pathname.endsWith('/api/chat');
  } catch {
    return false;
  }
}

function install(): void {
  const scope = window as Window & { [PATCHED_FLAG]?: boolean };
  if (scope[PATCHED_FLAG]) return;

  const originalFetch = window.fetch.bind(window);
  const memoryReady = hydrateUniversalMemory();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isChatRequest(input) || !init?.body || typeof init.body !== 'string') {
      return originalFetch(input, init);
    }

    let body: ChatBody;
    try {
      body = JSON.parse(init.body) as ChatBody;
    } catch {
      return originalFetch(input, init);
    }

    const text = typeof body.message === 'string' ? body.message.trim() : '';
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : 'local';
    if (!text) return originalFetch(input, init);

    await memoryReady;

    const rememberedName = extractExplicitUserName(text);
    if (rememberedName) {
      return chatResponse(conversationId, `Entendido, ${rememberedName}. Guardé tu nombre en la memoria universal local de Andrew. Estará disponible en otros chats y después de cerrar la aplicación.`);
    }

    const memory = getUniversalMemory();
    if (isNameRecallQuery(text)) {
      return chatResponse(
        conversationId,
        memory.name ? `Tu nombre es ${memory.name}. Lo tengo guardado en la memoria universal local.` : 'Todavía no tengo tu nombre guardado en la memoria universal local.',
      );
    }

    if (isUniversalMemoryCommand(text)) {
      return chatResponse(
        conversationId,
        memory.name ? `Memoria universal local activa. Tu nombre (${memory.name}) está disponible entre chats y no depende de GPT.` : 'La memoria universal local está disponible. Dime tu nombre y lo guardaré entre chats.',
      );
    }

    return originalFetch(input, init);
  };

  scope[PATCHED_FLAG] = true;
}

if (typeof window !== 'undefined' && typeof window.fetch === 'function') install();
