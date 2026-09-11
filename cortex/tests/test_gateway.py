import httpx
import pytest

from app.gateway import Circuit, CircuitState, ModelGateway


def response(status: int, content: str = "ok") -> httpx.Response:
    return httpx.Response(status, json={"choices": [{"message": {"content": content}}]})


@pytest.mark.asyncio
async def test_429_falls_back_to_secondary():
    calls = []

    def handler(request: httpx.Request):
        body = request.content.decode()
        calls.append(body)
        return response(429) if "primary" in body else response(200, "secondary")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
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
    class RouteTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            body = request.content.decode()
            if "primary" in body:
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
            body = request.content.decode()
            if "local" in body:
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
    assert not circuit.allow()
    circuit.success()
    assert circuit.state is CircuitState.CLOSED
