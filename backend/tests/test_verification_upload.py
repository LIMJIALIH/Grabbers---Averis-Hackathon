import json

from fastapi.testclient import TestClient

from app.api.routes import verifications as upload_route
from app.main import create_app
from app.schemas.classification import ClassificationResponse


def prediction(category="BL_COMPARISON"):
    labels = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
    scores = {label: 0.01 for label in labels}
    scores[category] = 0.96
    return ClassificationResponse(
        category=category, confidence=0.96, scores=scores, device="cpu"
    )


class FakeClassifier:
    def __init__(self, category="BL_COMPARISON"):
        self.category = category

    def predict(self, subject, body):
        return prediction(self.category)


def email_json(attachments=None):
    return json.dumps(
        {
            "email_id": "email_upload_001",
            "from": "sender@example.com",
            "subject": "Please compare the SI and draft BL",
            "body": "Kindly verify both documents.",
            "attachments": attachments or [],
        }
    ).encode()


def test_json_only_email_is_classified(monkeypatch):
    monkeypatch.setattr(
        upload_route, "get_email_classifier", lambda: FakeClassifier("GENERAL")
    )
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/verifications",
            files={"email": ("email.json", email_json(), "application/json")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"]["category"] == "GENERAL"
    assert payload["verification"] is None
    assert payload["case"]["id"] == "email_upload_001"
    assert payload["case"]["attachments"] == []


def test_txt_si_and_bl_are_verified_without_gemma(monkeypatch):
    monkeypatch.setattr(upload_route, "get_email_classifier", lambda: FakeClassifier())
    si = b"""SHIPPING INSTRUCTION
SHIPPER: ALPHA PAPER PTE LTD
CONSIGNEE: BETA TRADING
NOTIFY PARTY: BETA TRADING
PORT OF LOADING: SINGAPORE
PORT OF DISCHARGE: MERSIN
CONTAINER COUNT: 2
GROSS WEIGHT: 20000 KG
"""
    bl = si.replace(b"SHIPPING INSTRUCTION", b"BILL OF LADING")
    attachments = ["attachments/email_009_SI.txt", "attachments/email_009_BL.txt"]

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/verifications",
            files=[
                ("email", ("email_009.json", email_json(attachments), "application/json")),
                ("attachments", ("email_009_SI.txt", si, "text/plain")),
                ("attachments", ("email_009_BL.txt", bl, "text/plain")),
            ],
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["gemma_used"] is False
    assert payload["verification"]["extraction_status"] == "ok"
    assert len(payload["case"]["fields"]) == 7
    assert payload["case"]["fields"][0]["si"] == "ALPHA PAPER PTE LTD"
    assert payload["case"]["fields"][0]["bl"] == "ALPHA PAPER PTE LTD"


def test_email_upload_must_be_valid_json():
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/verifications",
            files={"email": ("email.json", b"not-json", "application/json")},
        )
    assert response.status_code == 422
