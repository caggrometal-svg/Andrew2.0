import asyncio
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx
from prometheus_client import Counter, Gauge, Histogram

from .config import settings

GATEWAY_REQUESTS = Counter("andrew_gateway_requests_total", "Gateway attempts by route and outcome", ["model", "outcome"])
GATEWAY_LATENCY = Histogram("andrew_gateway_latency_seconds", "Gateway request latency by route", ["model"])
GATEWAY_FALLBACKS = Counter("andrew_gateway_fallbacks_total", "Fallback transitions between model routes", ["from_model", "to_model"])
GATEWAY_PROVIDER_ERRORS = Counter("andrew_gateway_provider_errors_total", "Retryable provider failures by route and status", ["model", "status"])
CIRCUIT_STATE = Gauge("andrew_gateway_circuit_state", "Circuit state: 0=closed, 1=open, 2=half_open", ["model"])


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
    probe_in_flight: bool = False

    def allow(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN and time.monotonic() - self.opened_at >= self.cooldown:
            if self.probe_in_flight:
                return False
            self.state = CircuitState.HALF_OPEN
            self.probe_in_flight = True
            return True
        if self.state == CircuitState.HALF_OPEN and not self.probe_in_flight:
            self.probe_in_flight = True
            return True
        return False

    def success(self) -> None:
        self.failures = 0
        self.state = CircuitState.CLOSED
        self.probe_in_flight = False

    def failure(self) -> None:
        self.failures += 1
        self.probe_in_flight = False
        if self.failures >= self.threshold:
            self.state = CircuitState.OPEN
            self.opened_at = time.monotonic()


class ModelGateway:
    """Resilient client-side gateway around LiteLLM."""

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client or httpx.AsyncClient(timeout=settings.litellm_timeout_seconds)
        self._owns_client = client is None
        self._circuits: dict[str, Circuit] = {}
        self._lock = asyncio.Lock()

    async def _circuit(self, model: str) -> Circuit:
        async with self._lock:
            circuit = self._circuits.setdefault(model, Circuit())
            CIRCUIT_STATE.labels(model).set(self._state_number(circuit.state))
            return circuit

    @staticmethod
    def _state_number(state: CircuitState) -> int:
        return {CircuitState.CLOSED: 0, CircuitState.OPEN: 1, CircuitState.HALF_OPEN: 2}[state]

    async def chat(self, messages: list[dict[str, Any]], routes: list[str], user: str) -> dict[str, Any]:
        last_error: Exception | None = None
        failed_model: str | None = None
        for model in routes:
            if failed_model is not None and failed_model != model:
                GATEWAY_FALLBACKS.labels(failed_model, model).inc()
                failed_model = None
            circuit = await self._circuit(model)
            if not circuit.allow():
                GATEWAY_REQUESTS.labels(model, "circuit_open").inc()
                continue
            started = time.perf_counter()
            try:
                response = await self._client.post(
                    f"{settings.litellm_base_url.rstrip('/')}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.litellm_master_key}"},
                    json={"model": model, "messages": messages, "user": user, "stream": False},
                )
                elapsed = time.perf_counter() - started
                GATEWAY_LATENCY.labels(model).observe(elapsed)
                if response.status_code >= 400:
                    if response.status_code in {408, 429} or response.status_code >= 500:
                        circuit.failure()
                        CIRCUIT_STATE.labels(model).set(self._state_number(circuit.state))
                        GATEWAY_PROVIDER_ERRORS.labels(model, str(response.status_code)).inc()
                        GATEWAY_REQUESTS.labels(model, "retryable_error").inc()
                        last_error = RuntimeError(f"{model}: HTTP {response.status_code}")
                        failed_model = model
                        continue
                    GATEWAY_REQUESTS.labels(model, "non_retryable_error").inc()
                    response.raise_for_status()
                circuit.success()
                CIRCUIT_STATE.labels(model).set(self._state_number(circuit.state))
                data = response.json()
                choice = data.get("choices", [{}])[0]
                content = choice.get("message", {}).get("content")
                if not isinstance(content, str):
                    raise TypeError(f"{model}: invalid completion payload")
                GATEWAY_REQUESTS.labels(model, "success").inc()
                usage = data.get("usage") or {}
                completion_tokens = usage.get("completion_tokens")
                result: dict[str, Any] = {"content": content, "raw": data, "model": model}
                if isinstance(completion_tokens, (int, float)) and elapsed > 0:
                    result["tokens_per_second"] = round(float(completion_tokens) / elapsed, 2)
                return result
            except (httpx.TimeoutException, httpx.NetworkError, RuntimeError, TypeError) as exc:
                circuit.failure()
                CIRCUIT_STATE.labels(model).set(self._state_number(circuit.state))
                GATEWAY_REQUESTS.labels(model, "exception").inc()
                last_error = exc
                failed_model = model
                continue
        raise RuntimeError(f"all model routes unavailable: {last_error}")

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
