import httpx
import pytest

from app.gateway import Circuit, CircuitState, ModelGateway


def response(status: int, content: str = "ok") -> httpx.Response:
    return httpx.Response(status, json={"choices": [{"message": {"content": content}}]})


@pytest.mark.asyncio
async def test_429_falls_back_to_secondary():
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.read().decode())
        model = request.read().decode()
        return response(429) if 'primary' in model else response(200, "secondary")

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport)
    gateway = ModelGateway(client)
    try:
        result = await gateway.chat([], ["primary", "secondary"], "u1")
        assert result["model"] == "secondary"
        assert result["content"] == "secondary"
        assert len(calls) == 2
    finally:
        await gateway.close()
        await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("exc", [httpx.ReadTimeout("timeout"), httpx.ConnectError("down")])
async def test_timeout_or_provider_down_falls_back(exc):
    def handler(request: httpx.Request):
        if request.url.path.endswith("/v1/chat/completions"):
            if request.headers.get("x-model") == "secondary":
                return response(200, "local")
            raise exc
        return response(500)

    class RouteTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            model = request.content.decode()
            if "primary" in model:
                raise exc
            return response(200, "secondary")

    client = httpx.AsyncClient(transport=RouteTransport())
    gateway = ModelGateway(client)
    try:
        result = await gateway.chat([], ["primary", "secondary"], "u1")
        assert result["model"] == "secondary"
    finally:
        await gateway.close()
        await client.aclose()


@pytest.mark.asyncio
async def test_5xx_retries_and_local_is_last_fallback():
    class Transport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            model = request.content.decode()
            if "local" in model:
                return response(200, "local-ok")
            return response(503)

    client = httpx.AsyncClient(transport=Transport())
    gateway = ModelGateway(client)
    try:
        result = await gateway.chat([], ["primary", "secondary", "local"], "u1")
        assert result["model"] == "local"
        assert result["content"] == "local-ok"
    finally:
        await gateway.close()
        await client.aclose()


def test_circuit_closed_open_half_open_closed(monkeypatch):
    clock = {"now": 100.0}
    monkeypatch.setattr("app.gateway.time.monotonic", lambda: clock["now"])
    circuit = Circuit(threshold=3, cooldown=20)
    assert circuit.state is CircuitState.CLOSED
    assert circuit.allow()
    circuit.failure()
    circuit.failure()
    circuit.failure()
    assert circuit.state is CircuitState.OPEN
    assert not circuit.allow()
    clock["now"] += 20
    assert circuit.allow()
    assert circuit.state is CircuitState.HALF_OPEN
    circuit.success()
    assert circuit.state is CircuitState.CLOSED
