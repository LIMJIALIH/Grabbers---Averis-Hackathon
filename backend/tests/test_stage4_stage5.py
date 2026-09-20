"""Run from backend: python -m pytest tests/test_stage4_stage5.py -v -s.

Tests ingestion, automatic Stage 4 -> Stage 5, and legacy field extraction.
OCR is stubbed in the scanned test; no external model or OCR engine is needed.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.schemas.ingestion import ClassifiedEmail
from app.services.attachment_text import extract_attachment_text
from app.services.document_fields import extract_comparison_fields
from app.services.ingestion import ingest_email
from app.services.verification import process_email, extract_ingested_fields


BUNDLE = Path(__file__).resolve().parents[1] / "resources" / "sdoc-hackathon-bundle"
FIELD_KEYS = {
    "shipper", "consignee", "notify_party", "port_of_loading",
    "port_of_discharge", "container_count", "gross_weight_kg",
}


def classified_email(*names):
    return ClassifiedEmail(
        email_id="stage4-stage5-test", tag="SI",
        attachments=[{"filename": name, "path": name} for name in names],
    )


@pytest.mark.parametrize("sample,si_ext,bl_ext,weight", [
    ("email_040", "txt", "txt", "222690"),
    ("email_005", "xlsx", "xlsx", "341715"),
    ("email_055", "xlsx", "docx", "243588"),
    ("email_059", "pdf", "pdf", "131322"),
])
def test_real_documents_ingestion_and_extraction(sample, si_ext, bl_ext, weight):
    names = [f"{sample}_SI.{si_ext}", f"{sample}_BL.{bl_ext}"]

    def unexpected_ocr(image):
        pytest.fail("These digital sample documents should not require OCR")

    result = ingest_email(classified_email(*names), BUNDLE / "attachments", ocr=unexpected_ocr)
    assert result.status == "ok"
    # BL INSTRUCTION headings conflict with the SI filename heuristic.
    expected_si_type = "SI" if sample == "email_040" else "UNKNOWN"
    assert [document.document_type for document in result.documents] == [expected_si_type, "BL"]
    assert result.requires_human_review == (expected_si_type == "UNKNOWN")
    shipper = "ASIA PACIFIC" if sample == "email_005" else "APRIL FINE PAPER"
    for name, document in zip(names, result.documents):
        assert document.text.strip()
        assert document.segments
        assert not document.ocr_used
        extracted = extract_attachment_text(BUNDLE / "attachments" / name)
        assert extracted.strip()
        # Both parsers must retain the sample's shipper, despite layout differences.
        assert shipper in extracted.upper()
        assert shipper in document.text.upper()

    fields = extract_comparison_fields([f"attachments/{name}" for name in names], BUNDLE)
    by_key = {field["key"]: field for field in fields}
    assert set(by_key) == FIELD_KEYS
    assert by_key["gross_weight_kg"]["si"] == weight
    assert by_key["shipper"]["si"]
    assert by_key["shipper"]["bl"]
    # Explicit roles resolve ambiguous BL INSTRUCTION headings for automation.
    email = classified_email(*names)
    email.attachments[0].document_type = "SI"
    email.attachments[1].document_type = "BL"
    automated = process_email(email, BUNDLE / "attachments", ocr=unexpected_ocr)
    assert automated.status == "ok"
    assert {field.key for field in automated.fields} == FIELD_KEYS
    assert next(field for field in automated.fields if field.key == "gross_weight_kg").si == weight
    print(json.dumps({"sample": sample, "stage4_status": result.status,
                      "requires_human_review": result.requires_human_review,
                      "stage5_weight": by_key["gross_weight_kg"]}, indent=2))


def test_stage5_normalization_mismatch_and_missing_fields(tmp_path):
    (tmp_path / "sample_SI.txt").write_text(
        "SHIPPING INSTRUCTION\nShipper: Example Exporter\nConsignee: Buyer Ltd\n"
        "POL: Singapore\nP/D: Port Klang\nContainer Count: 5 containers\n"
        "Gross Weight: 12.45 MT\n", encoding="utf-8",
    )
    (tmp_path / "sample_BL.txt").write_text(
        "BILL OF LADING\nShipper: EXAMPLE EXPORTER\nConsignee: Buyer Ltd\n"
        "Port of Loading: Singapore\nPort of Discharge: Port Klang\n"
        "Container Count: 6\nGross Weight: 12,450 kg\n", encoding="utf-8",
    )
    fields = extract_comparison_fields(["sample_SI.txt", "sample_BL.txt"], tmp_path)
    by_key = {field["key"]: field for field in fields}
    assert set(by_key) == FIELD_KEYS
    for key in ("shipper", "consignee", "port_of_loading", "port_of_discharge", "gross_weight_kg"):
        assert by_key[key]["confidence"] == 100
    assert by_key["gross_weight_kg"]["si"] == by_key["gross_weight_kg"]["bl"] == "12450"
    assert by_key["container_count"]["si"] == "5"
    assert by_key["container_count"]["bl"] == "6"
    assert by_key["container_count"]["confidence"] == 70
    assert by_key["notify_party"]["si"] == by_key["notify_party"]["bl"] == ""
    assert by_key["notify_party"]["confidence"] == 0
    print(json.dumps({"stage5_fields": fields}, indent=2))


def test_stage5_missing_bl(tmp_path):
    (tmp_path / "sample_SI.txt").write_text("Shipper: Example Exporter", encoding="utf-8")
    fields = extract_comparison_fields(["sample_SI.txt", "missing_BL.txt"], tmp_path)
    shipper = next(field for field in fields if field["key"] == "shipper")
    assert shipper["si"] == "Example Exporter"
    assert shipper["bl"] == ""
    assert shipper["confidence"] == 60


def test_stage4_api_preserves_success_when_an_attachment_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    attachments = tmp_path / "attachments"
    attachments.mkdir()
    (attachments / "sample_SI.txt").write_text("SHIPPING INSTRUCTION\nShipper: Example Exporter", encoding="utf-8")
    (attachments / "broken_BL.pdf").write_bytes(b"Invalid PDF")
    payload = classified_email("sample_SI.txt", "broken_BL.pdf").model_dump()
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/ingestion", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "partial"
    assert result["requires_human_review"]
    assert "Example Exporter" in result["documents"][0]["text"]
    assert result["documents"][1]["status"] == "error"
    assert result["documents"][1]["error"]


def test_stage4_scanned_pdf_ocr_fallback(tmp_path):
    from PIL import Image

    with Image.new("RGB", (400, 200), "white") as image:
        image.save(tmp_path / "scan_SI.pdf", "PDF")
    calls = []

    def stub_ocr(image):
        calls.append(image.size)
        return "SHIPPING INSTRUCTION\nShipper: Scanned Exporter"

    result = ingest_email(classified_email("scan_SI.pdf"), tmp_path, ocr=stub_ocr)
    assert result.status == "ok"
    assert len(calls) == 1
    document = result.documents[0]
    assert document.ocr_used
    assert document.pages == 1
    assert document.segments[0].page_number == 1
    assert "Scanned Exporter" in document.text
    fields = extract_ingested_fields(result)
    assert next(field for field in fields.fields if field.key == "shipper").si == "Scanned Exporter"
    assert fields.requires_human_review  # BL and other required fields are absent.


COMPLETE_TEXT = (
    "Shipper: Example Exporter\nConsignee: Buyer Ltd\nNotify Party: Agent Ltd\n"
    "Port of Loading: Singapore\nPort of Discharge: Port Klang\n"
    "Container Count: 5\nGross Weight: 12.45 MT\n"
)


def test_automatic_api_reads_each_attachment_once(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bundle_dir", tmp_path)
    root = tmp_path / "attachments"
    root.mkdir()
    names = ["sample_SI.txt", "sample_BL.txt"]
    for name in names:
        (root / name).write_text(COMPLETE_TEXT, encoding="utf-8")
    reads = []
    original = Path.read_bytes

    def counted_read(path):
        if path.parent == root:
            reads.append(path.name)
        return original(path)

    monkeypatch.setattr(Path, "read_bytes", counted_read)
    # Any accidental use of the old file-based extractor must fail the test.
    def no_legacy_read(*args):
        pytest.fail("Stage 5 must use ingested text, not reopen attachments")

    monkeypatch.setattr("app.services.document_fields.extract_attachment_text", no_legacy_read)
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/ingestion", json=classified_email(*names).model_dump())
    assert response.status_code == 200
    result = response.json()
    assert reads == names
    assert result["status"] == result["extraction_status"] == "ok"
    assert not result["requires_human_review"]
    assert not result["review_reasons"]
    assert len(result["fields"]) == 7
    assert all(field["confidence"] == 100 for field in result["fields"])
    assert result["fields"][-1]["si"] == "12450"


def test_handoff_works_after_source_files_are_removed(tmp_path):
    names = ["sample_SI.txt", "sample_BL.txt"]
    for name in names:
        (tmp_path / name).write_text(COMPLETE_TEXT, encoding="utf-8")
    ingestion = ingest_email(classified_email(*names), tmp_path)
    for name in names:
        (tmp_path / name).unlink()
    result = extract_ingested_fields(ingestion)
    assert result.extraction_status == "ok"
    assert len(result.fields) == 7


@pytest.mark.parametrize("scenario", ["mismatch", "corrupt", "unknown", "duplicate", "pending"])
def test_automatic_pipeline_review_conditions(tmp_path, scenario):
    (tmp_path / "sample_SI.txt").write_text(COMPLETE_TEXT, encoding="utf-8")
    (tmp_path / "sample_BL.txt").write_text(
        COMPLETE_TEXT.replace("Count: 5", "Count: 6") if scenario == "mismatch" else COMPLETE_TEXT,
        encoding="utf-8",
    )
    email = classified_email("sample_SI.txt", "sample_BL.txt")
    if scenario == "corrupt":
        (tmp_path / "broken_BL.pdf").write_bytes(b"invalid PDF")
        email = classified_email("sample_SI.txt", "broken_BL.pdf")
    elif scenario == "unknown":
        (tmp_path / "sample_SI.txt").write_text("BILL OF LADING\n" + COMPLETE_TEXT, encoding="utf-8")
    elif scenario == "duplicate":
        (tmp_path / "second_SI.txt").write_text(COMPLETE_TEXT, encoding="utf-8")
        email = classified_email("sample_SI.txt", "second_SI.txt", "sample_BL.txt")
    elif scenario == "pending":
        email.requires_human_review = True
    result = process_email(email, tmp_path)
    assert result.requires_human_review
    assert result.review_reasons
    if scenario == "pending":
        assert result.extraction_status == "skipped"
        assert not result.documents and not result.fields
    else:
        assert result.extraction_status == "review_required"
        if scenario == "mismatch":
            assert "SI/BL mismatch: container_count" in result.review_reasons
        if scenario in {"unknown", "duplicate"}:
            assert all(not field.si for field in result.fields)
