from dataclasses import dataclass
from typing import Any

from fastembed import SparseTextEmbedding, TextEmbedding
from qdrant_client import AsyncQdrantClient, models

from .config import settings


_dense = TextEmbedding(model_name=settings.embedding_model)
_sparse = SparseTextEmbedding(model_name=settings.sparse_embedding_model)


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    text: str
    score: float
    payload: dict[str, Any]


class PrecisionRAG:
    def __init__(self):
        self.client = AsyncQdrantClient(url=settings.qdrant_url)
        self.collection = settings.qdrant_collection

    async def ensure_collection(self) -> None:
        exists = await self.client.collection_exists(self.collection)
        if exists:
            return
        await self.client.create_collection(
            collection_name=self.collection,
            vectors_config={"dense": models.VectorParams(size=settings.embedding_dim, distance=models.Distance.COSINE)},
            sparse_vectors_config={"sparse": models.SparseVectorParams(index=models.SparseIndexParams(on_disk=True))},
        )

    async def _embeddings(self, text: str):
        import asyncio

        def run():
            dense = list(_dense.embed([text]))[0].tolist()
            sparse = list(_sparse.embed([text]))[0]
            return dense, sparse

        return await asyncio.to_thread(run)

    async def search(self, query: str, tenant: str, user: str, top_k: int | None = None) -> list[RetrievedChunk]:
        dense, sparse = await self._embeddings(query)
        limit = max((top_k or settings.rag_top_k) * 4, 20)
        query_filter = models.Filter(must=[
            models.FieldCondition(key="tenant", match=models.MatchValue(value=tenant)),
            models.FieldCondition(key="user", match=models.MatchValue(value=user)),
        ])
        points = await self.client.query_points(
            collection_name=self.collection,
            prefetch=[
                models.Prefetch(query=dense, using="dense", limit=limit),
                models.Prefetch(
                    query=models.SparseVector(indices=sparse.indices.tolist(), values=sparse.values.tolist()),
                    using="sparse", limit=limit,
                ),
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
        return self._rerank(query, candidates)[: top_k or settings.rag_top_k]

    @staticmethod
    def _rerank(query: str, candidates: list[RetrievedChunk]) -> list[RetrievedChunk]:
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
