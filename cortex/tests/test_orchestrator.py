import pytest

from app.admission import AdmissionController, Priority
from app.orchestrator import AIRequest, AndrewOrchestrator, Intent


@pytest.mark.parametrize(
    ("message", "intent"),
    [
        ("recuerda mi nombre", Intent.MEMORY),
        ("revisa el commit del repositorio", Intent.CODE),
        ("analiza este documento y sus fuentes", Intent.KNOWLEDGE),
        ("revisa el proyecto Cortex", Intent.PROJECT),
        ("genera un video", Intent.MULTIMEDIA),
        ("hola Andrew", Intent.CHAT),
    ],
)
def test_intent_classification(message, intent):
    assert AndrewOrchestrator.classify_intent(message) is intent


def test_route_selection():
    orchestrator = AndrewOrchestrator.__new__(AndrewOrchestrator)
    assert orchestrator._routes(Intent.CODE)[0] == "andrew-code-primary"
    assert orchestrator._routes(Intent.MULTIMEDIA)[0] == "andrew-multimodal-primary"
    assert orchestrator._routes(Intent.CHAT) == ["andrew-primary", "andrew-secondary", "andrew-local"]


def test_priority_policy():
    orchestrator = AndrewOrchestrator.__new__(AndrewOrchestrator)
    assert orchestrator.priority_for(Intent.MEMORY, Priority.P4) is Priority.P1
    assert orchestrator.priority_for(Intent.PROJECT, Priority.P0) is Priority.P0
    assert orchestrator.priority_for(Intent.MULTIMEDIA, Priority.P0) is Priority.P2
    assert orchestrator.priority_for(Intent.CHAT, Priority.P3) is Priority.P3


def test_cache_identity_is_sanitized():
    orchestrator = AndrewOrchestrator.__new__(AndrewOrchestrator)
    assert orchestrator._cache_tag("tenant:admin") == "tenant_admin"
    assert orchestrator._cache_tag("user with spaces") == "user_with_spaces"
    with pytest.raises(ValueError):
        orchestrator._cache_tag("")
    with pytest.raises(ValueError):
        orchestrator._cache_tag("x" * 257)


@pytest.mark.asyncio
async def test_execute_uses_cache_without_gateway():
    admission = AdmissionController(1, {priority: 4 for priority in Priority})
    orchestrator = AndrewOrchestrator.__new__(AndrewOrchestrator)
    orchestrator.admission = admission

    class Cache:
        async def get(self, key, prompt):
            return "cached-answer"

    orchestrator.cache = Cache()
    await admission.start(workers=1)
    try:
        result = await orchestrator.execute(AIRequest("t", "u", "c", "hola"))
        assert result == {"response": "cached-answer", "source": "semantic_cache", "intent": "chat"}
    finally:
        await admission.close()
