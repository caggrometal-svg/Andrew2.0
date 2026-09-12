import pytest

from app.cache import CacheKey, SemanticCache


class Pipeline:
    def __init__(self, redis):
        self.redis = redis

    def setex(self, key, ttl, value):
        self.redis.exact[key] = value
        return self

    def hset(self, key, mapping):
        self.redis.hashes[key] = mapping
        return self

    def expire(self, key, ttl):
        self.redis.ttls[key] = ttl
        return self

    async def execute(self):
        return []


class FakeRedis:
    def __init__(self):
        self.exact = {}
        self.hashes = {}
        self.ttls = {}
        self.commands = []

    async def get(self, key):
        return self.exact.get(key)

    def pipeline(self):
        return Pipeline(self)

    async def execute_command(self, *args):
        self.commands.append(args)
        if args[0] == "FT.SEARCH":
            return [1, b"doc", [b"response", b"semantic", b"distance", b"0.02"]]
        return []


@pytest.fixture
def key():
    return CacheKey("tenant-a", "user-a", "es", "routing-v1", "system-v1")


@pytest.mark.asyncio
async def test_exact_cache_uses_sha256_key(key):
    redis = FakeRedis()
    cache = SemanticCache(redis)
    expected = cache._exact_key(key, "hola")
    redis.exact[expected] = "exact"
    assert await cache.get(key, "hola") == "exact"
    assert redis.commands == []


@pytest.mark.asyncio
async def test_semantic_cache_is_metadata_scoped(monkeypatch, key):
    redis = FakeRedis()
    cache = SemanticCache(redis)

    async def embedding(prompt):
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr("app.cache.dense_embedding", embedding)
    result = await cache.get(key, "consulta similar")
    assert result == "semantic"
    query = redis.commands[-1][2]
    assert "@tenant:{tenant-a}" in query
    assert "@user:{user-a}" in query
    assert "@locale:{es}" in query


@pytest.mark.asyncio
async def test_put_writes_exact_hash_and_ttl(monkeypatch, key):
    redis = FakeRedis()
    cache = SemanticCache(redis)

    async def embedding(prompt):
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr("app.cache.dense_embedding", embedding)
    await cache.put(key, "hola", "respuesta")
    assert cache._exact_key(key, "hola") in redis.exact
    assert cache._hash_key(key, "hola") in redis.hashes
    assert redis.ttls[cache._hash_key(key, "hola")] > 0
