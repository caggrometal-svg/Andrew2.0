from fastapi.testclient import TestClient

from app.main import create_app


class FakeRedis:
    async def ping(self):
        return True


class FakeCache:
    async def ensure_index(self):
        return None


class FakeRag:
    async def ensure_collection(self):
        return None

    async def close(self):
        return None


class FakeAdmission:
    async def start(self):
        return None

    async def close(self):
        return None


class FakeOrchestrator:
    def __init__(self, result=None, error=None):
        self.cache = FakeCache()
        self.rag = FakeRag()
        self.result = result or {"response": "ok", "intent": "chat", "source": "llm"}
        self.error = error

    async def execute(self, request):
        if self.error:
            raise self.error
        return self.result

    async def close(self):
        return None


def build(result=None, error=None):
    return create_app(
        redis=FakeRedis(),
        admission=FakeAdmission(),
        orchestrator=FakeOrchestrator(result=result, error=error),
    )


def test_health_is_public():
    with TestClient(build()) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["ok"] is True


def test_chat_requires_bearer_token():
    with TestClient(build()) as client:
        response = client.post("/v1/chat", json={"message": "hola", "conversation_id": "c1"})
        assert response.status_code == 401


def test_chat_accepts_valid_schema_and_token(monkeypatch):
    monkeypatch.setattr("app.main.settings.cortex_shared_token", "test-token")
    with TestClient(build()) as client:
        response = client.post(
            "/v1/chat",
            headers={"Authorization": "Bearer test-token"},
            json={"message": "hola", "conversation_id": "c1"},
        )
        assert response.status_code == 200
        assert response.json()["response"] == "ok"


def test_invalid_payload_is_rejected(monkeypatch):
    monkeypatch.setattr("app.main.settings.cortex_shared_token", "test-token")
    with TestClient(build()) as client:
        response = client.post(
            "/v1/chat",
            headers={"Authorization": "Bearer test-token"},
            json={"message": "", "conversation_id": "c1"},
        )
        assert response.status_code == 422


def test_runtime_error_maps_to_503(monkeypatch):
    monkeypatch.setattr("app.main.settings.cortex_shared_token", "test-token")
    with TestClient(build(error=RuntimeError("queue saturated"))) as client:
        response = client.post(
            "/v1/chat",
            headers={"Authorization": "Bearer test-token"},
            json={"message": "hola", "conversation_id": "c1"},
        )
        assert response.status_code == 503
        assert "queue saturated" in response.json()["detail"]


def test_unexpected_error_does_not_leak_details(monkeypatch):
    monkeypatch.setattr("app.main.settings.cortex_shared_token", "test-token")
    with TestClient(build(error=ValueError("secret internals"))) as client:
        response = client.post(
            "/v1/chat",
            headers={"Authorization": "Bearer test-token"},
            json={"message": "hola", "conversation_id": "c1"},
        )
        assert response.status_code == 500
        assert response.json()["detail"] == "Cortex internal error"
