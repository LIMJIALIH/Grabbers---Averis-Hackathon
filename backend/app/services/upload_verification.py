"""Orchestrate deterministic verification with an optional Gemma fallback."""

from pathlib import Path

from app.schemas.ingestion import ClassifiedEmail
from app.schemas.verification import VerificationResult
from app.services.document_fields import extract_fields_from_text
from app.services.gemma_attachment import GemmaAttachmentExtractor, GemmaUnavailableError
from app.services.ingestion import ingest_email, ocr_image
from app.services.verification import extract_ingested_fields


def _has_required_fields(text: str, document_type: str) -> bool:
    if not text.strip() or document_type == "UNKNOWN":
        return False
    if document_type == "BL":
        fields = extract_fields_from_text("", text)
        return any(field["bl"] for field in fields)
    fields = extract_fields_from_text(text, "")
    return any(field["si"] for field in fields)


def process_uploaded_email(
    email: ClassifiedEmail,
    attachment_root: Path,
    gemma: GemmaAttachmentExtractor,
    *,
    ocr=ocr_image,
) -> tuple[VerificationResult, bool, list[str]]:
    ingestion = ingest_email(email, attachment_root, ocr=ocr)
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
    return extract_ingested_fields(ingestion), gemma_used, fallback_warnings
