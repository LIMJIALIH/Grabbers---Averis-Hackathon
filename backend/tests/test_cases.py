import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app


def test_sample_email_and_attachment(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    (tmp_path / "inbox").mkdir()
    (tmp_path / "attachments").mkdir()
    resources_attachments = Path(__file__).resolve().parents[1] / "resources" / "sdoc-hackathon-bundle" / "attachments"
    (tmp_path / "attachments" / "sample_SI.txt").write_text(
        (resources_attachments / "email_040_SI.txt").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (tmp_path / "attachments" / "sample_BL.txt").write_text(
        (resources_attachments / "email_040_BL.txt").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (tmp_path / "secret.txt").write_text("private", encoding="utf-8")
    email = {"email_id": "email_001", "from": "sender@example.com", "subject": "Check documents", "body": "Please review.", "attachments": ["attachments/sample_SI.txt", "attachments/sample_BL.txt", "secret.txt", "attachments/missing.pdf"]}
    (tmp_path / "inbox" / "email_001.json").write_text(json.dumps(email), encoding="utf-8")
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/cases")
        assert response.status_code == 200
        case = response.json()[0]
        assert case["body"] == email["body"]
        assert case["vessel"] == email["subject"]
        assert case["attachments"][0]["text"].startswith("SHIPPING INSTRUCTION")
        assert client.get(case["attachments"][0]["url"]).text.startswith("SHIPPING INSTRUCTION")
        assert case["attachments"][1]["url"] is not None
        assert case["attachments"][2]["url"] is None
        assert case["attachments"][3]["url"] is None
        assert [field["key"] for field in case["fields"]] == [
            "shipper",
            "consignee",
            "notify_party",
            "port_of_loading",
            "port_of_discharge",
            "container_count",
            "gross_weight_kg",
        ]
        assert case["fields"][1]["si"] == "TOPKOPY MIDDLE EAST FZE"
        assert case["fields"][1]["bl"] == "TOPKOPY MIDDLE EAST FZE"
        assert case["fields"][5]["si"] == "10"
        assert case["fields"][6]["si"] == "222690"
        assert case["fields"][6]["confidence"] == 100
        assert client.get("/api/v1/cases/email_001/attachments/1").status_code == 200
        for index in [-1, 2, 3]:
            assert client.get(f"/api/v1/cases/email_001/attachments/{index}").status_code == 404
        assert client.get("/api/v1/cases/unknown/attachments/0").status_code == 404


def test_missing_and_empty_inbox(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/cases").status_code == 503
        (tmp_path / "inbox").mkdir()
        assert client.get("/api/v1/cases").json() == []


def test_port_aliases_are_extracted(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    (tmp_path / "inbox").mkdir()
    (tmp_path / "attachments").mkdir()
    (tmp_path / "attachments" / "alias_SI.txt").write_text(
        """SHIPPING INSTRUCTION
POL - SINGAPORE (SGSIN)
P/D - TUTICORIN, INDIA (KEMBA)
""",
        encoding="utf-8",
    )
    (tmp_path / "attachments" / "alias_BL.txt").write_text(
        """BILL OF LADING (DRAFT)
Port of Landing: SINGAPORE (SGSIN)
Port of Discharge - TUTICORIN, INDIA (KEMBA)
""",
        encoding="utf-8",
    )
    email = {
        "email_id": "email_alias",
        "from": "sender@example.com",
        "subject": "Alias test",
        "body": "",
        "attachments": ["attachments/alias_SI.txt", "attachments/alias_BL.txt"],
    }
    (tmp_path / "inbox" / "email_alias.json").write_text(json.dumps(email), encoding="utf-8")

    with TestClient(create_app()) as client:
        case = client.get("/api/v1/cases").json()[0]
        assert case["fields"][3]["si"] == "SINGAPORE (SGSIN)"
        assert case["fields"][4]["si"] == "TUTICORIN, INDIA (KEMBA)"
        assert case["fields"][3]["bl"] == "SINGAPORE (SGSIN)"
        assert case["fields"][4]["bl"] == "TUTICORIN, INDIA (KEMBA)"


def test_mixed_format_real_samples_extract_fields(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    (tmp_path / "inbox").mkdir()
    (tmp_path / "attachments").mkdir()
    resources_attachments = Path(__file__).resolve().parents[1] / "resources" / "sdoc-hackathon-bundle" / "attachments"

    samples = {
        "email_005": ["email_005_SI.xlsx", "email_005_BL.xlsx"],
        "email_055": ["email_055_SI.xlsx", "email_055_BL.docx"],
        "email_059": ["email_059_SI.pdf", "email_059_BL.pdf"],
    }

    for email_id, attachment_names in samples.items():
        copied_attachments = []
        for attachment_name in attachment_names:
            source = resources_attachments / attachment_name
            target = tmp_path / "attachments" / attachment_name
            target.write_bytes(source.read_bytes())
            copied_attachments.append(f"attachments/{attachment_name}")
        email = {
            "email_id": email_id,
            "from": "sender@example.com",
            "subject": "Mixed sample",
            "body": "",
            "attachments": copied_attachments,
        }
        (tmp_path / "inbox" / f"{email_id}.json").write_text(json.dumps(email), encoding="utf-8")

    with TestClient(create_app()) as client:
        cases = client.get("/api/v1/cases").json()
        case_by_id = {case["id"]: case for case in cases}

        assert case_by_id["email_005"]["fields"][0]["si"].startswith("ASIA PACIFIC PAPERBOARD TRADING PTE LTD")
        assert case_by_id["email_005"]["fields"][6]["si"] == "341715"

        assert case_by_id["email_055"]["fields"][3]["si"] == "SINGAPORE"
        assert case_by_id["email_055"]["fields"][4]["bl"] == "KARACHI, PAKISTAN"
        assert case_by_id["email_055"]["fields"][6]["si"] == "243588"

        assert case_by_id["email_059"]["fields"][3]["si"] == "BUATAN, INDONESIA"
        assert case_by_id["email_059"]["fields"][4]["bl"] == "FREMANTLE, AUSTRALIA"
        assert case_by_id["email_059"]["fields"][6]["si"] == "131322"
