from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    app_name: str = "andrew-cortex"
    host: str = "0.0.0.0"
    port: int = 8080
    log_level: str = "INFO"
    cortex_shared_token: str

    redis_url: str
    qdrant_url: str
    qdrant_collection: str = "andrew_memory"

    litellm_base_url: str
    litellm_master_key: str
    litellm_timeout_seconds: float = 30.0
    local_vllm_base_url: str = "http://vllm:8000/v1"
    local_vllm_api_key: str = "local-dev-key"

    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    sparse_embedding_model: str = "Qdrant/bm25"
    embedding_dim: int = 384
    cache_similarity_threshold: float = 0.94
    cache_ttl_seconds: int = 3600
    rag_top_k: int = 8
    rag_max_context_chars: int = 24000

    max_concurrent_requests: int = 64
    p0_queue_size: int = 16
    p1_queue_size: int = 64
    p2_queue_size: int = 128
    p3_queue_size: int = 128
    p4_queue_size: int = 64

    system_prompt_version: str = "v1"
    model_version_routing: str = "v1"


settings = Settings()
