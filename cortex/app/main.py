from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from redis.asyncio import Redis
from starlette.responses import Response

from .admission import AdmissionController, Priority
from .config import settings
from .orchestrator import AIRequest, AndrewOrchestrator

REQUESTS = Counter("andrew_requests_total", "Total Andrew requests", ["source", "intent"])
LATENCY = Histogram("andrew_request_latency_seconds", "End-to-end request latency")
FALLBACKS = Counter("andrew_fallback_total", "Model fallback attempts")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)
    conversation_id: str = Field(min_length=1, max_length=128)
    tenant: str = Field(default="default", min_length=1, max_length=128)
    priority: Priority = Priority.P1
    locale: str = Field(default="es", min_length=2, max_length=16)


redis = Redis.from_url(settings.redis_url, decode_responses=False)
admission = AdmissionController(
    concurrency=settings.max_concurrent_requests,
    queue_sizes={
        Priority.P0: settings.p0_queue_size,
        Priority.P1: settings.p1_queue_size,
        Priority.P2: settings.p2_queue_size,
        Priority.P3: settings.p3_queue_size,
        Priority.P4: settings.p4_queue_size,
    },
)
orchestrator = AndrewOrchestrator(redis, admission)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await orchestrator.cache.ensure_index()
    await admission.start()
    yield
    await admission.close()
    await orchestrator.close()
    await redis.aclose()


app = FastAPI(title="Andrew 2.0 Cortex", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health():
    await redis.ping()
    return {"ok": True, "service": settings.app_name}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/chat")
async def chat(payload: ChatRequest, x_andrew_user_id: str | None = Header(default=None)):
    user_id = x_andrew_user_id or f"conversation:{payload.conversation_id}"
    try:
        with LATENCY.time():
            result = await orchestrator.execute(AIRequest(
                tenant=payload.tenant,
                user_id=user_id,
                conversation_id=payload.conversation_id,
                message=payload.message,
                locale=payload.locale,
                priority=payload.priority,
            ))
        REQUESTS.labels("api", result.get("intent", "unknown")).inc()
        return {"ok": True, **result}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
