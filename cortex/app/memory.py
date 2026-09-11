import json
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from redis.asyncio import Redis

from .config import settings


class MemoryKind(StrEnum):
    WORKING = "working"
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"
    PROJECT = "project"


@dataclass(frozen=True)
class Memory:
    kind: MemoryKind
    user_id: str
    key: str
    text: str
    importance: int = 3
    metadata: dict[str, Any] | None = None


class MemoryManager:
    """Five-tier memory with bounded working context and project state."""

    PREFIX = "andrew:memory:"

    def __init__(self, redis: Redis):
        self.redis = redis

    def _key(self, memory: Memory) -> str:
        return f"{self.PREFIX}{memory.kind}:{memory.user_id}:{memory.key}"

    async def put(self, memory: Memory, ttl: int | None = None) -> None:
        payload = json.dumps({
            "kind": memory.kind.value,
            "user_id": memory.user_id,
            "key": memory.key,
            "text": memory.text,
            "importance": memory.importance,
            "metadata": memory.metadata or {},
            "updated_at": int(time.time()),
        }, ensure_ascii=False)
        if ttl:
            await self.redis.setex(self._key(memory), ttl, payload)
        else:
            await self.redis.set(self._key(memory), payload)

    async def get(self, kind: MemoryKind, user_id: str, key: str) -> dict[str, Any] | None:
        raw = await self.redis.get(f"{self.PREFIX}{kind}:{user_id}:{key}")
        if raw is None:
            return None
        return json.loads(raw)

    async def project_state(self, user_id: str) -> dict[str, Any]:
        value = await self.get(MemoryKind.PROJECT, user_id, "state")
        return value or {"kind": "project", "text": "", "metadata": {}}

    async def context_snapshot(self, user_id: str) -> list[dict[str, Any]]:
        """Return bounded high-value memory without dumping the full store."""
        pattern = f"{self.PREFIX}*:{user_id}:*"
        keys: list[str] = []
        async for key in self.redis.scan_iter(match=pattern, count=100):
            keys.append(key.decode() if isinstance(key, bytes) else key)
            if len(keys) >= settings.memory_max_scan_keys:
                break
        if not keys:
            return []
        values = await self.redis.mget(keys)
        memories = [json.loads(v) for v in values if v]
        memories.sort(key=lambda item: int(item.get("importance", 0)), reverse=True)
        return memories[:16]

    async def compact_working_memory(self, user_id: str, messages: list[dict[str, str]], summarizer) -> str:
        """Incrementally summarize old turns. Summarizer is an injected async callable."""
        if len(messages) <= 12:
            return ""
        old = messages[:-8]
        transcript = "\n".join(f"{m['role']}: {m['content']}" for m in old)
        summary = await summarizer(transcript)
        await self.put(Memory(
            kind=MemoryKind.WORKING,
            user_id=user_id,
            key="summary",
            text=summary[:12000],
            importance=5,
            metadata={"source_messages": len(old)},
        ))
        return summary
