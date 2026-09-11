import asyncio
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx

from .config import settings


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class Circuit:
    failures: int = 0
    state: CircuitState = CircuitState.CLOSED
    opened_at: float = 0.0
    threshold: int = 3
    cooldown: float = 20.0

    def allow(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN and time.monotonic() - self.opened_at >= self.cooldown:
            self.state = CircuitState.HALF_OPEN
            return True
        return self.state == CircuitState.HALF_OPEN

    def success(self) -> None:
        self.failures = 0
        self.state = CircuitState.CLOSED

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= self.threshold:
            self.state = CircuitState.OPEN
            self.opened_at = time.monotonic()


class ModelGateway:
    """Client-side resilience around the LiteLLM gateway.

    LiteLLM remains the provider abstraction/routing layer. This circuit breaker
    prevents Andrew from repeatedly calling a route that is already unhealthy.
    """

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=settings.litellm_timeout_seconds)
        self._circuits: dict[str, Circuit] = {}
        self._lock = asyncio.Lock()

    async def _circuit(self, model: str) -> Circuit:
        async with self._lock:
            return self._circuits.setdefault(model, Circuit())

    async def chat(self, messages: list[dict[str, Any]], routes: list[str], user: str) -> dict[str, Any]:
        last_error: Exception | None = None
        for model in routes:
            circuit = await self._circuit(model)
            if not circuit.allow():
                continue
            try:
                response = await self._client.post(
                    f"{settings.litellm_base_url.rstrip('/')}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.litellm_master_key}"},
                    json={"model": model, "messages": messages, "user": user, "stream": False},
                )
                if response.status_code >= 400:
                    if response.status_code in {408, 429} or response.status_code >= 500:
                        circuit.failure()
                        last_error = RuntimeError(f"{model}: HTTP {response.status_code}")
                        continue
                    response.raise_for_status()
                circuit.success()
                data = response.json()
                choice = data.get("choices", [{}])[0]
                content = choice.get("message", {}).get("content")
                if not isinstance(content, str):
                    raise RuntimeError(f"{model}: invalid completion payload")
                return {"content": content, "raw": data, "model": model}
            except (httpx.TimeoutException, httpx.NetworkError, RuntimeError) as exc:
                circuit.failure()
                last_error = exc
                continue
        raise RuntimeError(f"all model routes unavailable: {last_error}")

    async def close(self) -> None:
        await self._client.aclose()
