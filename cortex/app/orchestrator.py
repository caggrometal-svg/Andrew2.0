from dataclasses import dataclass
from enum import StrEnum
import time
from typing import Any

from redis.asyncio import Redis

from .admission import AdmissionController, Priority
from .cache import CacheKey, SemanticCache
from .gateway import ModelGateway
from .memory import MemoryManager
from .rag import PrecisionRAG


class Intent(StrEnum):
    CHAT = "chat"
    KNOWLEDGE = "knowledge"
    CODE = "code"
    MEMORY = "memory"
    PROJECT = "project"
    MULTIMEDIA = "multimedia"


@dataclass(frozen=True)
class AIRequest:
    tenant: str
    user_id: str
    conversation_id: str
    message: str
    locale: str = "es"
    priority: Priority = Priority.P1


class AndrewOrchestrator:
    def __init__(self, redis: Redis, admission: AdmissionController):
        self.redis = redis
        self.admission = admission
        self.cache = SemanticCache(redis)
        self.memory = MemoryManager(redis)
        self.rag = PrecisionRAG()
        self.gateway = ModelGateway()

    @staticmethod
    def classify_intent(message: str) -> Intent:
        text = message.lower()
        if any(x in text for x in ("recuerda", "memoria", "guarda", "olvida")):
            return Intent.MEMORY
        if any(x in text for x in ("github", "rama", "commit", "repositorio", "código", "codigo")):
            return Intent.CODE
        if any(x in text for x in ("video", "imagen", "audio", "multimedia")):
            return Intent.MULTIMEDIA
        if any(x in text for x in ("según", "fuente", "documento", "evidencia", "busca")):
            return Intent.KNOWLEDGE
        return Intent.CHAT

    def priority_for(self, intent: Intent, requested: Priority) -> Priority:
        if intent in {Intent.MEMORY, Intent.PROJECT}:
            return min(requested, Priority.P1)
        if intent == Intent.MULTIMEDIA:
            return max(requested, Priority.P2)
        return requested

    async def _context(self, request: AIRequest, intent: Intent) -> str:
        memory = await self.memory.context_snapshot(request.user_id)
        blocks = [m.get("text", "") for m in memory if m.get("text")]
        if intent in {Intent.KNOWLEDGE, Intent.CODE, Intent.PROJECT}:
            chunks = await self.rag.search(request.message, request.tenant, request.user_id)
            rag_context = self.rag.compose_context(chunks)
            if rag_context:
                blocks.append(rag_context)
        return "\n\n".join(blocks)[-24000:]

    def _routes(self, intent: Intent) -> list[str]:
        if intent == Intent.CODE:
            return ["andrew-code-primary", "andrew-general-secondary", "andrew-local"]
        if intent == Intent.MULTIMEDIA:
            return ["andrew-multimodal-primary", "andrew-general-secondary", "andrew-local"]
        return ["andrew-primary", "andrew-secondary", "andrew-local"]

    async def execute(self, request: AIRequest) -> dict[str, Any]:
        intent = self.classify_intent(request.message)
        priority = self.priority_for(intent, request.priority)

        async def work() -> dict[str, Any]:
            started = time.perf_counter()
            key = CacheKey(
                tenant=request.tenant,
                user=request.user_id,
                locale=request.locale,
                model_version="routing-v1",
                system_prompt_version="v1",
            )
            cached = await self.cache.get(key, request.message)
            if cached is not None:
                return {"response": cached, "source": "semantic_cache", "intent": intent.value}

            context = await self._context(request, intent)
            system = (
                "Eres Andrew 2.0. Usa el contexto recuperado solo cuando sea pertinente. "
                "No inventes hechos ni fuentes. Mantén respuestas precisas."
            )
            if context:
                system += f"\n\nCONTEXTO RECUPERADO:\n{context}"
            result = await self.gateway.chat(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": request.message},
                ],
                routes=self._routes(intent),
                user=request.user_id,
            )
            response = result["content"]
            await self.cache.put(key, request.message, response)
            return {
                "response": response,
                "source": "llm",
                "model": result["model"],
                "intent": intent.value,
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            }

        return await self.admission.submit(priority, work)

    async def close(self) -> None:
        await self.gateway.close()
        await self.rag.close()
