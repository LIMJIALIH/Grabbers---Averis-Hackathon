"""Read attachments once, then extract fields from the resulting text."""

from pathlib import Path

from app.schemas.ingestion import ClassifiedEmail, IngestionResult
from app.schemas.verification import ComparisonField, VerificationResult
from app.services.document_fields import extract_fields_from_text
from app.services.ingestion import ingest_email, ocr_image


def extract_ingested_fields(ingestion: IngestionResult) -> VerificationResult:
    """Stage 5 consumes Stage 4 output, including OCR text and review flags."""
    result = VerificationResult(**ingestion.model_dump(), extraction_status="skipped")
    if ingestion.status == "review_required":
        result.review_reasons.append("Email is awaiting review before ingestion")
        return result

    texts = {"SI": "", "BL": ""}
    for kind in texts:
        candidates = [document for document in ingestion.documents
                      if document.document_type == kind
                      and document.status in {"ok", "partial"} and document.text.strip()]
        if len(candidates) == 1:
            texts[kind] = candidates[0].text
        elif len(candidates) > 1:
            result.review_reasons.append(f"Multiple {kind} documents; select one before comparison")
        else:
            result.review_reasons.append(f"No readable, identified {kind} document")

    if ingestion.requires_human_review:
        result.review_reasons.append("Stage 4 reported errors, warnings, or ambiguous document types")
    if any(texts.values()):
        result.fields = [ComparisonField(**field) for field in
                         extract_fields_from_text(texts["SI"], texts["BL"])]
        for field in result.fields:
            if not field.si or not field.bl:
                result.review_reasons.append(f"Missing SI or BL value: {field.key}")
            elif field.si.casefold() != field.bl.casefold():
                result.review_reasons.append(f"SI/BL mismatch: {field.key}")
        result.extraction_status = "review_required" if result.review_reasons else "ok"
    result.requires_human_review = bool(result.review_reasons)
    return result


def process_email(email: ClassifiedEmail, attachment_root: Path, *, ocr=ocr_image) -> VerificationResult:
    """Automatic Stage 4 -> Stage 5 entry point; attachment paths are read once."""
    return extract_ingested_fields(ingest_email(email, attachment_root, ocr=ocr))
