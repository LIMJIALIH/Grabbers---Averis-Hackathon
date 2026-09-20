from fastapi.testclient import TestClient

from app.api.routes import classification as classification_route
from app.main import create_app
from app.schemas.classification import ClassificationResponse


def test_classification_endpoint(monkeypatch):
    expected = ClassificationResponse(
        category="BL_COMPARISON",
        confidence=0.91,
        scores={
            "BL_COMPARISON": 0.91,
            "SI_REQUEST": 0.03,
            "INVOICE_QUERY": 0.02,
            "GENERAL": 0.03,
            "SPAM": 0.01,
        },
        device="cpu",
    )
    monkeypatch.setattr(classification_route.classifier, "predict", lambda subject, body: expected)

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/classification",
            json={"subject": "Please compare", "body": "Check the draft BL against the SI"},
        )

    assert response.status_code == 200
    assert response.json() == expected.model_dump()


def test_classification_requires_text():
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/classification", json={"subject": "  ", "body": ""}
        )

    assert response.status_code == 422
