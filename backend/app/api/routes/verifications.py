import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.ingestion import AttachmentInput, ClassifiedEmail
from app.schemas.verification_upload import (
    DashboardAttachment,
    DashboardCase,
    EmailUploadMetadata,
    VerificationUploadResponse,
)
from app.services.email_classifier import ModelUnavailableError
from app.services.gemma_attachment import GemmaAttachmentExtractor
from app.services.model_registry import get_email_classifier
from app.services.upload_verification import process_uploaded_email

router = APIRouter(prefix="/verifications", tags=["verification-upload"])

MAX_EMAIL_JSON_BYTES = 1024 * 1024
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".txt", ".png", ".jpg", ".jpeg"}
gemma_extractor = GemmaAttachmentExtractor(
    settings.gemma_api_key,
    settings.gemma_model,
    settings.gemma_timeout_ms,
)


def _safe_name(filename: str | None) -> str:
    name = Path(filename or "").name
    if not name or name in {".", ".."}:
        raise HTTPException(422, "Every upload must have a valid filename")
    return name


def _read_limited(upload: UploadFile, limit: int) -> bytes:
    chunks = []
    total = 0
    while chunk := upload.file.read(min(1024 * 1024, limit + 1 - total)):
        total += len(chunk)
        if total > limit:
            raise HTTPException(413, f"{_safe_name(upload.filename)} exceeds the upload limit")
        chunks.append(chunk)
    return b"".join(chunks)


def _document_type(name: str) -> str | None:
    stem = Path(name).stem.upper()
    if stem.endswith("_SI"):
        return "SI"
    if stem.endswith("_BL"):
        return "BL"
    return None


@router.post("", response_model=VerificationUploadResponse)
def create_verification(
    email: Annotated[UploadFile, File(description="Required email metadata JSON")],
    attachments: Annotated[list[UploadFile] | None, File()] = None,
) -> VerificationUploadResponse:
    if Path(_safe_name(email.filename)).suffix.lower() != ".json":
        raise HTTPException(422, "The email upload must be a JSON file")
    try:
        metadata = EmailUploadMetadata.model_validate_json(
            _read_limited(email, MAX_EMAIL_JSON_BYTES).decode("utf-8-sig")
        )
    except (UnicodeError, ValueError, ValidationError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"Invalid email JSON: {exc}") from exc

    try:
        classification = get_email_classifier().predict(metadata.subject, metadata.body)
    except ModelUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    uploads = attachments or []
    warnings: list[str] = []
    verification = None
    gemma_used = False
    dashboard_attachments: list[DashboardAttachment] = []

    with TemporaryDirectory(prefix="docuverify-upload-") as directory:
        root = Path(directory)
        attachment_inputs: list[AttachmentInput] = []
        seen_names: set[str] = set()
        for upload in uploads:
            name = _safe_name(upload.filename)
            suffix = Path(name).suffix.lower()
            if suffix not in SUPPORTED_EXTENSIONS:
                raise HTTPException(415, f"Unsupported attachment type: {name}")
            if name.casefold() in seen_names:
                raise HTTPException(422, f"Duplicate attachment filename: {name}")
            seen_names.add(name.casefold())
            content = _read_limited(upload, MAX_ATTACHMENT_BYTES)
            (root / name).write_bytes(content)
            attachment_inputs.append(
                AttachmentInput(
                    filename=name,
                    path=name,
                    document_type=_document_type(name),
                )
            )

        expected = {Path(name).name.casefold() for name in metadata.attachments}
        uploaded = {item.filename.casefold() for item in attachment_inputs}
        for name in sorted(expected - uploaded):
            warnings.append(f"Attachment listed by the email JSON was not uploaded: {name}")
        for name in sorted(uploaded - expected):
            if expected:
                warnings.append(f"Uploaded attachment was not listed by the email JSON: {name}")

        if classification.category == "BL_COMPARISON" and attachment_inputs:
            legacy_email = ClassifiedEmail(
                email_id=metadata.email_id,
                tag="SI",
                attachments=attachment_inputs,
            )
            verification, gemma_used, fallback_warnings = process_uploaded_email(
                legacy_email, root, gemma_extractor
            )
            warnings.extend(fallback_warnings)
            dashboard_attachments = [
                DashboardAttachment(
                    name=document.filename,
                    text=document.text[:100_000] or None,
                )
                for document in verification.documents
            ]
        else:
            if classification.category == "BL_COMPARISON":
                warnings.append("Comparison email has no uploaded SI/BL attachments")
            elif attachment_inputs:
                warnings.append(
                    f"Attachments were not processed because the email category is {classification.category}"
                )
            dashboard_attachments = [DashboardAttachment(name=item.filename) for item in attachment_inputs]

    case = DashboardCase(
        id=metadata.email_id,
        vessel=metadata.subject or "(No subject)",
        company=metadata.sender,
        time=datetime.now(timezone.utc).isoformat(),
        kind=classification.category.replace("_", " ").title(),
        fields=verification.fields if verification else [],
        body=metadata.body,
        attachments=dashboard_attachments,
    )
    return VerificationUploadResponse(
        case=case,
        classification=classification,
        verification=verification,
        gemma_used=gemma_used,
        warnings=warnings,
    )
