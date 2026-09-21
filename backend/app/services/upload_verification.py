"""Orchestrate deterministic verification with an optional Gemma fallback."""

from pathlib import Path

from app.schemas.ingestion import ClassifiedEmail, IngestionResult
from app.schemas.verification import ComparisonField, VerificationResult
from app.services.document_fields import extract_fields_from_text
from app.services.gemma_attachment import GemmaAttachmentExtractor, GemmaUnavailableError
from app.services.ingestion import ingest_email


def _has_required_fields(text: str, document_type: str) -> bool:
    if not text.strip() or document_type == "UNKNOWN":
        return False
    if document_type == "BL":
        fields = extract_fields_from_text("", text)
        return any(field["bl"] for field in fields)
    fields = extract_fields_from_text(text, "")
    return any(field["si"] for field in fields)


def _extract_uploaded_fields(ingestion: IngestionResult) -> VerificationResult:
    """Keep JSON uploads deterministic after the optional Gemma text fallback."""
    result = VerificationResult(**ingestion.model_dump(), extraction_status="skipped")
    texts = {"SI": "", "BL": ""}
    for kind in texts:
        candidates = [
            document
            for document in ingestion.documents
            if document.document_type == kind
            and document.status in {"ok", "partial"}
            and document.text.strip()
        ]
        if len(candidates) == 1:
            texts[kind] = candidates[0].text
        elif len(candidates) > 1:
            result.review_reasons.append(f"Multiple {kind} documents; select one before comparison")
        else:
            result.review_reasons.append(f"No readable, identified {kind} document")

    if ingestion.requires_human_review:
        result.review_reasons.append("Stage 4 reported errors, warnings, or ambiguous document types")
    if any(texts.values()):
        result.fields = [
            ComparisonField(**field)
            for field in extract_fields_from_text(texts["SI"], texts["BL"])
        ]
        for field in result.fields:
            if not field.si or not field.bl:
                result.review_reasons.append(f"Missing SI or BL value: {field.key}")
            elif field.si.casefold() != field.bl.casefold():
                result.review_reasons.append(f"SI/BL mismatch: {field.key}")
        result.extraction_status = "review_required" if result.review_reasons else "ok"
    result.requires_human_review = bool(result.review_reasons)
    return result


def process_uploaded_email(
    email: ClassifiedEmail,
    attachment_root: Path,
    gemma: GemmaAttachmentExtractor,
) -> tuple[VerificationResult, bool, list[str]]:
    ingestion = ingest_email(email, attachment_root)
    gemma_used = False
    fallback_warnings: list[str] = []

    for attachment, document in zip(email.attachments, ingestion.documents):
        if _has_required_fields(document.text, document.document_type):
            continue
        if not gemma.available:
            message = f"{document.filename}: deterministic extraction was incomplete and Gemma is not configured"
            document.warnings.append(message)
            fallback_warnings.append(message)
            continue
        try:
            extracted = gemma.extract(attachment_root / attachment.path, document.text)
            replacement = extracted.canonical_text()
            if replacement:
                document.text = replacement
            if document.document_type == "UNKNOWN" and extracted.document_type != "UNKNOWN":
                document.document_type = extracted.document_type
            document.status = "partial"
            document.error = None
            document.warnings.append("Gemma 4 fallback extracted this document; verify all values")
            gemma_used = True
        except GemmaUnavailableError as exc:
            message = f"{document.filename}: {exc}"
            document.warnings.append(message)
            fallback_warnings.append(message)

    if gemma_used or fallback_warnings or any(document.warnings for document in ingestion.documents):
        ingestion.requires_human_review = True
        if ingestion.status == "ok":
            ingestion.status = "partial"
    return _extract_uploaded_fields(ingestion), gemma_used, fallback_warnings
