"""Accept a document field only when two independent normalized outputs agree."""

from app.core.config import settings
from app.integrations.gemini_extractor import ExtractionError, extract_document_fields
from app.schemas.extraction import DocumentExtraction, FieldCheck, ModelExtraction, RawFields
from app.schemas.ingestion import IngestedDocument
from app.services.field_normalization import normalize_fields


def extract_document_consensus(document: IngestedDocument, *, extractor=None) -> DocumentExtraction:
    extractor = extractor or extract_document_fields
    models = [value.strip().removeprefix("models/") for value in
              (settings.extraction_primary_model, settings.extraction_secondary_model)]
    result = DocumentExtraction(filename=document.filename, document_type=document.document_type)
    preflight_error = None
    if not all(models) or models[0].casefold() == models[1].casefold():
        preflight_error = "Configure two distinct, nonempty Gemini model IDs"
    elif len(document.text) > settings.extraction_max_input_chars:
        preflight_error = "Document exceeds extraction input limit; text was not truncated"

    for model in models:
        attempt = ModelExtraction(model=model)
        result.attempts.append(attempt)
        try:
            if preflight_error:
                raise ExtractionError(preflight_error)
            arguments = {"model": model}
            # Test or alternate extractors retain the text-only extension point.
            # The production Gemini adapter receives the original PDF for native vision.
            if extractor is extract_document_fields:
                arguments["pdf_path"] = document.source_path
            attempt.raw_fields = RawFields.model_validate(
                extractor(document.text, document.document_type, **arguments))
            attempt.normalized_fields, attempt.issues = normalize_fields(attempt.raw_fields)
            result.issues.extend(f"{model}: {issue}" for issue in attempt.issues)
        except Exception as exc:
            attempt.error = str(exc) if isinstance(exc, ExtractionError) else f"Extraction failed ({type(exc).__name__})"

    failed = any(attempt.error for attempt in result.attempts)
    if failed:
        result.error = "; ".join(f"{attempt.model}: {attempt.error}" for attempt in result.attempts if attempt.error)
    for key in RawFields.model_fields:
        status = "model_error"
        if not failed:
            first, second = (getattr(attempt.normalized_fields, key) for attempt in result.attempts)
            if first is None or second is None:
                status = "missing_or_invalid"
            elif (first.casefold() == second.casefold() if isinstance(first, str) else first == second):
                status = "agreed"
                setattr(result.normalized_fields, key, first)
            else:
                status = "disagreed"
        result.field_checks.append(FieldCheck(key=key, status=status))
        if status != "agreed":
            result.issues.append(f"{key}: {status}")
    return result
