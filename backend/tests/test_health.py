from fastapi.testclient import TestClient

from app.main import create_app
from app.core.config import settings


def test_health():
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "docuverify"}


def test_resource_location():
    assert (settings.bundle_dir / "sample_submission.json").is_file()


def test_resources_are_not_public():
    with TestClient(create_app()) as client:
        assert client.get("/resources/sdoc-hackathon-docker/data_v2/ground_truth.json").status_code == 404
