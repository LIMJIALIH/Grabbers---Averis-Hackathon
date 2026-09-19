import json

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app


def test_sample_email_and_attachment(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    (tmp_path / "inbox").mkdir()
    (tmp_path / "attachments").mkdir()
    (tmp_path / "attachments" / "sample.txt").write_text("Original SI contents", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("private", encoding="utf-8")
    email = {"email_id": "email_001", "from": "sender@example.com", "subject": "Check documents", "body": "Please review.", "attachments": ["attachments/sample.txt", "secret.txt", "attachments/missing.pdf"]}
    (tmp_path / "inbox" / "email_001.json").write_text(json.dumps(email), encoding="utf-8")
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/cases")
        assert response.status_code == 200
        case = response.json()[0]
        assert case["body"] == email["body"]
        assert case["vessel"] == email["subject"]
        assert case["attachments"][0]["text"] == "Original SI contents"
        assert client.get(case["attachments"][0]["url"]).text == "Original SI contents"
        assert case["attachments"][1]["url"] is None
        for index in [-1, 1, 2, 3]:
            assert client.get(f"/api/v1/cases/email_001/attachments/{index}").status_code == 404
        assert client.get("/api/v1/cases/unknown/attachments/0").status_code == 404


def test_missing_and_empty_inbox(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/cases").status_code == 503
        (tmp_path / "inbox").mkdir()
        assert client.get("/api/v1/cases").json() == []
