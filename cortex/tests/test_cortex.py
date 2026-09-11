from app.admission import AdmissionController, Priority
from app.orchestrator import AndrewOrchestrator, Intent


def test_priority_queue_configuration():
    controller = AdmissionController(2, {p: 3 for p in Priority})
    assert all(queue.maxsize == 3 for queue in controller._queues.values())


def test_intent_classification():
    assert AndrewOrchestrator.classify_intent("recuerda mi nombre") == Intent.MEMORY
    assert AndrewOrchestrator.classify_intent("revisa el commit del repositorio") == Intent.CODE
    assert AndrewOrchestrator.classify_intent("analiza este documento y sus fuentes") == Intent.KNOWLEDGE
    assert AndrewOrchestrator.classify_intent("hola Andrew") == Intent.CHAT
