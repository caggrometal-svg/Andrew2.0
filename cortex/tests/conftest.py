import os

os.environ.setdefault("CORTEX_SHARED_TOKEN", "test-token")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("LITELLM_BASE_URL", "http://localhost:4000")
os.environ.setdefault("LITELLM_MASTER_KEY", "test-key")

import pytest

from app.admission import AdmissionController, Priority


@pytest.fixture
def admission_controller():
    return AdmissionController(2, {priority: 2 for priority in Priority})
