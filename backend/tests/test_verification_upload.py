import json

from fastapi.testclient import TestClient

from app.api.routes import verifications as upload_route
from app.main import create_app
from app.schemas.classification import ClassificationResponse
from app.schemas.verification_upload import EmailUploadMetadata


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


class UnavailableGemma:
    available = False


class NormalizingGemma:
    available = True

    def normalize(self, path, fallback_id):
        return EmailUploadMetadata(
            email_id=fallback_id,
            sender="sender@example.com",
            subject="Please compare documents",
            body="Check the draft BL against the SI.",
        )

    def classify(self, subject, body, attachment_names):
        raise AssertionError("High-confidence BERT result should not use Gemma classification")


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


def test_invalid_json_without_gemma_returns_controlled_error(monkeypatch):
    monkeypatch.setattr(upload_route, "gemma_email", UnavailableGemma())
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/verifications",
            files={"email": ("email.json", b"not-json", "application/json")},
        )
    assert response.status_code == 422


def test_non_deterministic_email_format_is_normalized_before_bert(monkeypatch):
    monkeypatch.setattr(upload_route, "gemma_email", NormalizingGemma())
    monkeypatch.setattr(
        upload_route, "get_email_classifier", lambda: FakeClassifier("GENERAL")
    )
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/verifications",
            files={"email": ("forwarded-email.png", b"fake-image", "image/png")},
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["normalization_source"] == "gemma"
    assert payload["gemma_used"] is True
    assert payload["classification"]["category"] == "GENERAL"


def test_eml_is_normalized_locally_without_gemma(monkeypatch):
    monkeypatch.setattr(upload_route, "gemma_email", UnavailableGemma())
    monkeypatch.setattr(
        upload_route, "get_email_classifier", lambda: FakeClassifier("GENERAL")
    )
    eml = (
        b"Message-ID: <email-eml-001>\r\n"
        b"From: ops@example.com\r\n"
        b"Subject: Status update\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        b"The shipment is proceeding normally."
    )
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/v1/verifications",
            files={"email": ("message.eml", eml, "message/rfc822")},
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["normalization_source"] == "eml"
    assert payload["gemma_used"] is False
    assert payload["case"]["id"] == "email-eml-001"
    assert payload["case"]["vessel"] == "Status update"
