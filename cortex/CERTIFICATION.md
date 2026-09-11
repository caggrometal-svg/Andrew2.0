# Andrew 2.0 Cortex — Certification Gate

## Scope

Branch: `cortex-foundation`

Freeze: `iac33-integration-next`, `server.mjs` and APK are not modified by Cortex work.

## Gate matrix

| Gate | Status | Evidence / blocker |
|---|---|---|
| UNIT TESTS | PENDING EXECUTION | Test suite and fixtures committed; runtime execution is required. |
| ADMISSION P0–P4 | PENDING EXECUTION | Priority, saturation, worker and error tests added. |
| GATEWAY/FALLBACK | PENDING EXECUTION | 408/429/5xx/timeout/provider-down/local fallback tests added. |
| CIRCUIT BREAKER | PENDING EXECUTION | CLOSED/OPEN/HALF_OPEN transitions and single-probe test added. |
| REDIS CACHE | PENDING EXECUTION | Exact, semantic, metadata and TTL tests added; direct cache tag escaping remains blocked by GitHub contents update conflict, with API-level identity sanitization enforced in orchestrator. |
| QDRANT/RAG | PENDING EXECUTION | Lazy embeddings, hybrid dense+sparse, RRF, filters, payload indexes and reranking tests added. |
| MEMORY | PENDING EXECUTION | Five memory kinds, bounded snapshot and compaction tests added. |
| FASTAPI | PENDING EXECUTION | App factory, auth, validation, 503 and safe 500 tests added. |
| SECURITY | PENDING EXECUTION | Internal service exposure reduced; image tags pinned; identity sanitization added; runtime verification required. |
| DOCKER | PENDING EXECUTION | Compose contract and config validation are scripted; Docker is unavailable in the current execution environment. |
| BUILD | PENDING EXECUTION | Python compile/ruff gate scripted; runtime execution unavailable here. |

## Hard certification rule

This document must not be changed to `PASS` without actual execution evidence for every gate. In particular, no E2E integration with `server.mjs` is permitted until this matrix is fully green.

## Known execution limitation

The current execution environment has Python/Git but no Docker binary and cannot reach GitHub from the local container. GitHub Actions workflow `cortex-certification.yml` is committed, but no workflow run is available for the current branch yet. Therefore a formal PASS would be false.
