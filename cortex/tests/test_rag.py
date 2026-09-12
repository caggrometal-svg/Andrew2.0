from app.rag import PrecisionRAG, RetrievedChunk


def chunk(identifier, text, score):
    return RetrievedChunk(identifier, text, score, {"tenant": "t", "user": "u", "project": "p"})


def test_rrf_lexical_rerank_prefers_matching_text():
    candidates = [
        chunk("1", "documento completamente distinto", 0.95),
        chunk("2", "evidencia del proyecto Andrew", 0.90),
    ]
    ranked = PrecisionRAG._rerank("evidencia proyecto Andrew", candidates)
    assert ranked[0].id == "2"


def test_compose_context_is_bounded():
    chunks = [chunk(str(i), "x" * 5000, 1.0) for i in range(10)]
    context = PrecisionRAG.compose_context(chunks)
    assert len(context) <= 24000
    assert context.startswith("[RAG-1]")


def test_rerank_handles_empty_query():
    candidates = [chunk("1", "texto", 0.5)]
    assert PrecisionRAG._rerank("", candidates)[0].id == "1"
