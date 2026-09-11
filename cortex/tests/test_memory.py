import json

import pytest

from app.memory import Memory, MemoryKind, MemoryManager


class FakeRedis:
    def __init__(self):
        self.data = {}

    async def set(self, key, value):
        self.data[key] = value

    async def setex(self, key, ttl, value):
        self.data[key] = value

    async def get(self, key):
        return self.data.get(key)

    async def mget(self, keys):
        return [self.data.get(key) for key in keys]

    async def scan_iter(self, match, count=100):
        prefix = match.replace("*", "")
        for key in list(self.data):
            if key.startswith(prefix):
                yield key


@pytest.mark.asyncio
async def test_all_five_memory_kinds_round_trip():
    redis = FakeRedis()
    manager = MemoryManager(redis)
    for index, kind in enumerate(MemoryKind):
        await manager.put(Memory(kind, "u1", f"k{index}", kind.value, importance=index))
        result = await manager.get(kind, "u1", f"k{index}")
        assert result["kind"] == kind.value
        assert result["text"] == kind.value


@pytest.mark.asyncio
async def test_context_snapshot_is_bounded_and_priority_sorted():
    redis = FakeRedis()
    manager = MemoryManager(redis)
    for index in range(40):
        await manager.put(Memory(MemoryKind.SEMANTIC, "u1", str(index), str(index), importance=index))
    snapshot = await manager.context_snapshot("u1")
    assert len(snapshot) == 16
    assert snapshot[0]["importance"] == 39


@pytest.mark.asyncio
async def test_working_memory_compacts_old_turns():
    redis = FakeRedis()
    manager = MemoryManager(redis)
    messages = [{"role": "user", "content": str(i)} for i in range(13)]

    async def summarizer(transcript):
        return "summary:" + transcript[:20]

    summary = await manager.compact_working_memory("u1", messages, summarizer)
    stored = await manager.get(MemoryKind.WORKING, "u1", "summary")
    assert summary.startswith("summary:")
    assert stored["importance"] == 5
    assert stored["metadata"]["source_messages"] == 5
