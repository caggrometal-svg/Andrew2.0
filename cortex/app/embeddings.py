import asyncio

from fastembed import SparseTextEmbedding, TextEmbedding

from .config import settings


_dense = TextEmbedding(model_name=settings.embedding_model)
_sparse = SparseTextEmbedding(model_name=settings.sparse_embedding_model)


async def dense_embedding(text: str) -> list[float]:
    def run() -> list[float]:
        return next(iter(_dense.embed([text]))).tolist()

    return await asyncio.to_thread(run)


async def sparse_embedding(text: str):
    def run():
        return next(iter(_sparse.embed([text])))

    return await asyncio.to_thread(run)
