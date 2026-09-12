import hashlib
import logging
import re
import time
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError

from .config import settings
from .embeddings import dense_embedding

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CacheKey:
    tenant: str
    user: str
    locale: str
    model_version: str
    system_prompt_version: str


class SemanticCache:
    INDEX = "andrew_cache_idx"
    PREFIX = "andrew:cache:"
    HASH_PREFIX = "andrew:cache:item:"
    _TAG_ESCAPE = re.compile(r"([,.<>{}\[\]\\\"':;|=])")

    def __init__(self, redis: Redis):
        self.redis = redis

    @classmethod
    def _tag(cls, value: str) -> str:
        if not value or len(value) > 256:
            raise ValueError("invalid cache identity")
        return cls._TAG_ESCAPE.sub(r"\\\1", value)

    @staticmethod
    def _digest(key: CacheKey, prompt: str) -> str:
        raw = f"{key.tenant}|{key.user}|{key.locale}|{key.model_version}|{key.system_prompt_version}|{prompt}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @classmethod
    def _exact_key(cls, key: CacheKey, prompt: str) -> str:
        return cls.PREFIX + cls._digest(key, prompt)

    @classmethod
    def _hash_key(cls, key: CacheKey, prompt: str) -> str:
        return cls.HASH_PREFIX + cls._digest(key, prompt)

    async def ensure_index(self) -> None:
        try:
            await self.redis.execute_command("FT.INFO", self.INDEX)
            return
        except RedisError as exc:
            logger.debug("cache index probe unavailable: %s", exc)
        schema = [
            "FT.CREATE", self.INDEX, "ON", "HASH", "PREFIX", "1", self.HASH_PREFIX,
            "SCHEMA", "tenant", "TAG", "user", "TAG", "locale", "TAG",
            "model_version", "TAG", "system_prompt_version", "TAG",
            "prompt_embedding", "VECTOR", "HNSW", "6", "TYPE", "FLOAT32",
            "DIM", str(settings.embedding_dim), "DISTANCE_METRIC", "COSINE",
            "response", "TEXT", "created_at", "NUMERIC",
        ]
        try:
            await self.redis.execute_command(*schema)
        except RedisError as exc:
            if "Index already exists" not in str(exc):
                raise

    async def get(self, key: CacheKey, prompt: str) -> str | None:
        exact = await self.redis.get(self._exact_key(key, prompt))
        if exact is not None:
            return exact.decode() if isinstance(exact, bytes) else str(exact)

        vector = await dense_embedding(prompt)
        query = (
            f"(@tenant:{{{self._tag(key.tenant)}}} @user:{{{self._tag(key.user)}}} "
            f"@locale:{{{self._tag(key.locale)}}} @model_version:{{{self._tag(key.model_version)}}} "
            f"@system_prompt_version:{{{self._tag(key.system_prompt_version)}}})=>[KNN 1 "
            f"@prompt_embedding $vec AS distance]"
        )
        try:
            result = await self.redis.execute_command(
                "FT.SEARCH", self.INDEX, query, "PARAMS", "2", "vec", self._vector_blob(vector),
                "SORTBY", "distance", "ASC", "RETURN", "2", "response", "distance", "DIALECT", "2",
            )
        except RedisError:
            return None
        if not result or result[0] == 0:
            return None
        fields = result[2]
        distance = 1.0
        for idx, value in enumerate(fields):
            name = value.decode() if isinstance(value, bytes) else value
            if name == "distance":
                distance = float(fields[idx + 1])
                break
        if 1.0 - distance < settings.cache_similarity_threshold:
            return None
        for idx, value in enumerate(fields):
            name = value.decode() if isinstance(value, bytes) else value
            if name == "response":
                value = fields[idx + 1]
                return value.decode() if isinstance(value, bytes) else str(value)
        return None

    async def put(self, key: CacheKey, prompt: str, response: str) -> None:
        vector = await dense_embedding(prompt)
        exact_key = self._exact_key(key, prompt)
        hash_key = self._hash_key(key, prompt)
        pipe = self.redis.pipeline()
        pipe.setex(exact_key, settings.cache_ttl_seconds, response)
        pipe.hset(hash_key, mapping={
            "tenant": key.tenant, "user": key.user, "locale": key.locale,
            "model_version": key.model_version,
            "system_prompt_version": key.system_prompt_version,
            "prompt_embedding": self._vector_blob(vector),
            "response": response, "created_at": int(time.time()),
        })
        pipe.expire(hash_key, settings.cache_ttl_seconds)
        await pipe.execute()

    @staticmethod
    def _vector_blob(vector: list[float]) -> bytes:
        import struct
        return struct.pack(f"<{len(vector)}f", *vector)
