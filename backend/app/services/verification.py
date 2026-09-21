"""Read attachments once, then extract fields from the resulting text."""

from pathlib import Path
from decimal import Decimal

from app.schemas.extraction import NormalizedFields
from app.schemas.ingestion import ClassifiedEmail, IngestionResult
from app.schemas.verification import ComparisonField, VerificationResult
from app.services.document_fields import FIELD_SPECS
from app.services.extraction_consensus import extract_document_consensus
from app.services.ingestion import ingest_email


def extract_ingested_fields(ingestion: IngestionResult, *, extractor=None) -> VerificationResult:
    """Stage 5 consumes Stage 4 text/PDF sources and review flags."""
    result = VerificationResult(**ingestion.model_dump(), extraction_status="skipped")
    if ingestion.status == "review_required":
        result.review_reasons.append("Email is awaiting review before ingestion")
        return result

    values = {"SI": NormalizedFields(), "BL": NormalizedFields()}
    for kind in values:
        candidates = [document for document in ingestion.documents
                      if document.document_type == kind
                      and document.status in {"ok", "partial"}
                      and (document.text.strip() or document.source_path is not None)]
        if len(candidates) == 1:
            document = candidates[0]
            extraction = extract_document_consensus(document, extractor=extractor)
            result.document_extractions.append(extraction)
            values[kind] = extraction.normalized_fields
            result.review_reasons.extend(f"{kind}: {issue}" for issue in extraction.issues)
            if extraction.error:
                result.review_reasons.append(f"{kind}: {extraction.error}")
        elif len(candidates) > 1:
            result.review_reasons.append(f"Multiple {kind} documents; select one before comparison")
        else:
            result.review_reasons.append(f"No readable, identified {kind} document")

    if ingestion.requires_human_review:
        result.review_reasons.append("Stage 4 reported errors, warnings, or ambiguous document types")
    if result.document_extractions:
        for key, label in FIELD_SPECS:
            si, bl = getattr(values["SI"], key), getattr(values["BL"], key)
            missing = si is None or bl is None
            equal = not missing and (si.casefold() == bl.casefold() if isinstance(si, str) else si == bl)
            score = 0 if si is None and bl is None else 60 if missing else 100 if equal else 70
            result.fields.append(ComparisonField(key=key, label=label, si=_display(si), bl=_display(bl), confidence=score))
            if missing:
                result.review_reasons.append(f"Missing SI or BL value: {key}")
            elif not equal:
                result.review_reasons.append(f"SI/BL mismatch: {key}")
        result.extraction_status = "review_required" if result.review_reasons else "ok"
    result.requires_human_review = bool(result.review_reasons)
    return result


def _display(value) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return format(value, "f").rstrip("0").rstrip(".") if "." in format(value, "f") else str(value)
    return str(value)


def process_email(email: ClassifiedEmail, attachment_root: Path, *, extractor=None) -> VerificationResult:
    """Automatic Stage 4 -> Stage 5 entry point; attachment paths are read once."""
    return extract_ingested_fields(ingest_email(email, attachment_root), extractor=extractor)
