import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from starlette.responses import Response

from .admission import AdmissionController, Priority
from .config import settings
from .orchestrator import AIRequest, AndrewOrchestrator

REQUESTS = Counter("andrew_requests_total", "Total Andrew requests", ["source", "intent"])
LATENCY = Histogram("andrew_request_latency_seconds", "End-to-end request latency")
CACHE_HITS = Counter("andrew_cache_hits_total", "Semantic/exact cache hits", ["source"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)
    conversation_id: str = Field(min_length=1, max_length=128)
    tenant: str = Field(default="default", min_length=1, max_length=128)
    priority: Priority = Priority.P1
    locale: str = Field(default="es", min_length=2, max_length=16)


def build_admission() -> AdmissionController:
    return AdmissionController(
        concurrency=settings.max_concurrent_requests,
        queue_sizes={
            Priority.P0: settings.p0_queue_size,
            Priority.P1: settings.p1_queue_size,
            Priority.P2: settings.p2_queue_size,
            Priority.P3: settings.p3_queue_size,
            Priority.P4: settings.p4_queue_size,
        },
    )


def require_cortex_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Cortex authentication required")
    supplied = authorization[7:].strip()
    if not supplied or not secrets.compare_digest(supplied, settings.cortex_shared_token):
        raise HTTPException(status_code=401, detail="Invalid Cortex token")


def create_app(
    redis: Redis | None = None,
    admission: AdmissionController | None = None,
    orchestrator: AndrewOrchestrator | None = None,
) -> FastAPI:
    redis_client = redis or Redis.from_url(settings.redis_url, decode_responses=False)
    admission_controller = admission or build_admission()
    orchestrator_instance = orchestrator or AndrewOrchestrator(redis_client, admission_controller)
    owns_redis = redis is None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await redis_client.ping()
        await orchestrator_instance.cache.ensure_index()
        await orchestrator_instance.rag.ensure_collection()
        await admission_controller.start()
        try:
            yield
        finally:
            await admission_controller.close()
            await orchestrator_instance.close()
            if owns_redis:
                await redis_client.aclose()

    application = FastAPI(title="Andrew 2.0 Cortex", version="0.2.0", lifespan=lifespan)

    @application.get("/health")
    async def health():
        await redis_client.ping()
        return {"ok": True, "service": settings.app_name}

    @application.get("/metrics")
    async def metrics(_: None = Depends(require_cortex_token)):
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @application.post("/v1/chat")
    async def chat(
        payload: ChatRequest,
        _: None = Depends(require_cortex_token),
        x_andrew_user_id: str | None = Header(default=None),
    ):
        user_id = x_andrew_user_id or f"conversation:{payload.conversation_id}"
        try:
            with LATENCY.time():
                result = await orchestrator_instance.execute(AIRequest(
                    tenant=payload.tenant,
                    user_id=user_id,
                    conversation_id=payload.conversation_id,
                    message=payload.message,
                    locale=payload.locale,
                    priority=payload.priority,
                ))
            intent = result.get("intent", "unknown")
            REQUESTS.labels("api", intent).inc()
            if result.get("source") == "semantic_cache":
                CACHE_HITS.labels("api").inc()
            return {"ok": True, **result}
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Cortex internal error") from exc

    return application


redis = Redis.from_url(settings.redis_url, decode_responses=False)
admission = build_admission()
orchestrator = AndrewOrchestrator(redis, admission)
app = create_app(redis=redis, admission=admission, orchestrator=orchestrator)
