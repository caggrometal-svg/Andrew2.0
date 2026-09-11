from dataclasses import dataclass
from typing import Any

import litellm
from qdrant_client import AsyncQdrantClient, models

from .config import settings


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    text: str
    score: float
    payload: dict[str, Any]


class PrecisionRAG:
    """Hybrid dense+sparse retrieval with payload isolation and final rerank.

    Qdrant performs dense+sparse prefetch and RRF fusion. The final local
    reranker is intentionally isolated behind _rerank so it can be replaced
    by a cross-encoder/ColBERT service without changing the retrieval contract.
    """

    def __init__(self):
        self.client = AsyncQdrantClient(url=settings.qdrant_url)
        self.collection = settings.qdrant_collection

    async def _dense(self, text: str) -> list[float]:
        result = await litellm.aembedding(model=settings.embedding_model, input=[text])
        return result.data[0]["embedding"]

    async def search(self, query: str, tenant: str, user: str, top_k: int | None = None) -> list[RetrievedChunk]:
        dense = await self._dense(query)
        limit = max((top_k or settings.rag_top_k) * 4, 20)
        query_filter = models.Filter(must=[
            models.FieldCondition(key="tenant", match=models.MatchValue(value=tenant)),
            models.FieldCondition(key="user", match=models.MatchValue(value=user)),
        ])

        # Sparse query generation is kept explicit: production deployments can
        # use Qdrant's BM25 Document inference or an external SPLADE service.
        # The collection must expose a named `sparse` vector.
        sparse_query = models.Document(text=query, model="Qdrant/bm25")
        points = await self.client.query_points(
            collection_name=self.collection,
            prefetch=[
                models.Prefetch(query=dense, using="dense", limit=limit),
                models.Prefetch(query=sparse_query, using="sparse", limit=limit),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            query_filter=query_filter,
            with_payload=True,
            limit=limit,
        )
        candidates = [
            RetrievedChunk(str(point.id), str((point.payload or {}).get("text", "")),
                           float(point.score or 0), dict(point.payload or {}))
            for point in points.points
        ]
        ranked = await self._rerank(query, candidates)
        return ranked[: top_k or settings.rag_top_k]

    async def _rerank(self, query: str, candidates: list[RetrievedChunk]) -> list[RetrievedChunk]:
        # Stable baseline reranker. Replace with a cross-encoder service once
        # the benchmark set exists; never silently invent relevance scores.
        query_terms = {token.lower() for token in query.split() if len(token) > 2}
        scored: list[tuple[float, RetrievedChunk]] = []
        for chunk in candidates:
            terms = {token.lower() for token in chunk.text.split() if len(token) > 2}
            lexical = len(query_terms & terms) / max(1, len(query_terms))
            scored.append((0.8 * chunk.score + 0.2 * lexical, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in scored]

    @staticmethod
    def compose_context(chunks: list[RetrievedChunk]) -> str:
        parts: list[str] = []
        total = 0
        for index, chunk in enumerate(chunks, start=1):
            block = f"[RAG-{index}] {chunk.text.strip()}"
            if total + len(block) > settings.rag_max_context_chars:
                break
            parts.append(block)
            total += len(block)
        return "\n\n".join(parts)

    async def close(self) -> None:
        await self.client.close()
