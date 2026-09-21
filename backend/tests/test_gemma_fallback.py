from app.schemas.ingestion import AttachmentInput, ClassifiedEmail
from app.services.gemma_attachment import GemmaDocumentExtraction
from app.services.upload_verification import process_uploaded_email


class FakeGemma:
    available = True

    def extract(self, path, deterministic_text=""):
        return GemmaDocumentExtraction(
            document_type="SI",
            shipper="ALPHA PAPER",
            consignee="BETA TRADING",
            port_of_loading="SINGAPORE",
            port_of_discharge="MERSIN",
            container_count="2",
            gross_weight_kg="20000",
            extracted_text="fallback transcription",
        )


def test_unreadable_attachment_uses_gemma_and_requires_review(tmp_path):
    (tmp_path / "scan.png").write_bytes(b"not-a-real-image")
    email = ClassifiedEmail(
        email_id="email_scan",
        tag="SI",
        attachments=[AttachmentInput(filename="scan.png", path="scan.png")],
    )

    result, used, warnings = process_uploaded_email(email, tmp_path, FakeGemma())

    assert used is True
    assert warnings == []
    assert result.requires_human_review is True
    assert result.documents[0].document_type == "SI"
    assert result.fields[0].si == "ALPHA PAPER"
    assert "Gemma 4 fallback" in result.documents[0].warnings[0]


def test_gemma_numeric_json_values_are_coerced_to_text():
    result = GemmaDocumentExtraction.model_validate(
        {"container_count": 2, "gross_weight_kg": 20000}
    )
    assert result.container_count == "2"
    assert result.gross_weight_kg == "20000"
