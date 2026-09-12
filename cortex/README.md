# Andrew 2.0 Cortex

This directory is the first isolated Cortex foundation for `iac33-integration-next`. It does not replace the existing Node/Fastify backend yet. It provides a production-oriented Python control plane that can be integrated behind the existing Android bridge after validation.

## Components

- FastAPI + asyncio admission control with P0-P4 priority queues.
- LiteLLM gateway with provider aliases and configured fallbacks.
- Redis Stack exact + semantic cache with strict tenant/user/model/prompt-version segmentation.
- Qdrant hybrid dense + BM25 retrieval with payload isolation and RRF fusion.
- Five-tier memory: Working, Episodic, Semantic, Procedural and Project.
- Incremental working-memory compaction through an injected summarizer.
- vLLM OpenAI-compatible local inference with prefix caching enabled in the GPU profile.
- Prometheus metrics endpoint.
- Backend-only provider credentials.

## Start

```bash
cd cortex
cp .env.example .env
# Fill provider credentials and model names.
docker compose up -d redis qdrant litellm cortex
```

GPU node:

```bash
docker compose --profile gpu up -d
```

The Cortex API is exposed at `POST /v1/chat`. The existing Andrew backend remains untouched until this foundation passes tests and integration review.

## Routing contract

The client never receives provider credentials. The client sends an Andrew user token/header to the existing backend, which will later authenticate and forward to Cortex. Provider keys exist only in the LiteLLM/Cortex environment.

Route order is intent-aware:

- general: `andrew-primary -> andrew-secondary -> andrew-local`
- code: `andrew-code-primary -> andrew-general-secondary -> andrew-local`
- multimodal: `andrew-multimodal-primary -> andrew-general-secondary -> andrew-local`

The Cortex circuit breaker independently suppresses unhealthy model aliases. LiteLLM remains the provider abstraction, routing and retry layer.

## vLLM

The GPU profile uses the OpenAI-compatible vLLM server and enables Automatic Prefix Caching. Tensor/data parallel sizing is intentionally left to deployment capacity; it must be benchmarked against the selected model and GPU topology rather than hard-coded into the application.
