import pytest

from app.admission import AdmissionController, Priority


@pytest.fixture
def admission_controller():
    return AdmissionController(2, {priority: 2 for priority in Priority})
