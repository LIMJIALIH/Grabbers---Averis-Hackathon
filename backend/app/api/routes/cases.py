import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.attachment_text import extract_attachment_text
from app.services.document_fields import extract_fields_from_text
from app.services.case_verification import verify_case_documents
from app.services.email_classifier import ModelUnavailableError
from app.services.gemma_email import GemmaEmailGateway
from app.services.hybrid_classification import classify_with_fallback
from app.services.model_registry import get_email_classifier

router = APIRouter(prefix="/cases", tags=["cases"])
gemma_email = GemmaEmailGateway(
    settings.gemma_api_key,
    settings.gemma_model,
    settings.gemma_timeout_ms,
)


@lru_cache(maxsize=512)
def classify_case(subject: str, body: str, attachment_names: tuple[str, ...]):
    return classify_with_fallback(
        get_email_classifier(), gemma_email, subject, body, list(attachment_names)
    )


def inbox_directory() -> Path:
    bundle_inbox = settings.bundle_dir / "inbox"
    if bundle_inbox.is_dir():
        return bundle_inbox
    if settings.inference_dir.is_dir():
        return settings.inference_dir
    raise HTTPException(
        503,
        "No sample inbox is available. Configure DOCUVERIFY_BUNDLE_DIR or DOCUVERIFY_INFERENCE_DIR.",
    )


def inbox():
    directory = inbox_directory()
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(directory.glob("*.json"))]


def attachment_path(name: str) -> Path:
    if (settings.bundle_dir / "inbox").is_dir():
        root = (settings.bundle_dir / "attachments").resolve()
        path = (settings.bundle_dir / name).resolve()
    else:
        root = settings.inference_dir.resolve()
        path = (root / Path(name).name).resolve()
    if not path.is_file():
        raise HTTPException(404, "Attachment not found")
    if not path.is_relative_to(root):
        raise HTTPException(404, "Attachment not found")
    return path


def comparison_fields(attachment_names: list[str]) -> list[dict[str, object]]:
    texts = {"SI": "", "BL": ""}
    for name in attachment_names:
        try:
            path = attachment_path(name)
        except HTTPException:
            continue
        kind = "SI" if path.stem.upper().endswith("_SI") else "BL" if path.stem.upper().endswith("_BL") else None
        if kind and not texts[kind]:
            texts[kind] = extract_attachment_text(path)
    return extract_fields_from_text(texts["SI"], texts["BL"])


def find_email(email_id: str) -> dict:
    email = next((item for item in inbox() if item["email_id"] == email_id), None)
    if email is None:
        raise HTTPException(404, "Email not found")
    return email


@router.get("")
def list_cases():
    cases = []
    for email in inbox():
        email_attachments = list(email.get("attachments", []))
        try:
            classification = classify_case(
                email.get("subject", ""),
                email.get("body", ""),
                tuple(Path(name).name for name in email_attachments),
            )
        except ModelUnavailableError as exc:
            raise HTTPException(503, str(exc)) from exc
        attachments = []
        for index, name in enumerate(email_attachments):
            try:
                path = attachment_path(name)
            except HTTPException:
                attachments.append({"name": Path(name).name, "url": None, "text": None})
                continue
            text = extract_attachment_text(path)
            attachments.append({
                "name": path.name,
                "url": f"/api/v1/cases/{quote(email['email_id'], safe='')}/attachments/{index}",
                "text": text or None,
            })
        fields = [] if not email_attachments else comparison_fields(email_attachments)
        cases.append({
            "id": email["email_id"], "vessel": email.get("subject", "(No subject)"),
            "company": email.get("from", ""), "time": "", "kind": "Pending review",
            "state": "review", "fields": fields, "body": email.get("body", ""),
            "attachments": attachments, "extraction_source": "Text parser results",
            "category": classification.category,
            "classification_confidence": classification.confidence,
            "classification_source": classification.source,
            "classification_requires_review": classification.requires_human_review,
            "classification_reason": classification.fallback_reason,
        })
    return cases


@router.post("/{email_id}/extract")
def extract_case(email_id: str):
    """Parse one local case and apply main's evidence-based verification rules."""
    email = find_email(email_id)
    attachments = []
    for name in email.get("attachments", []):
        try:
            path = attachment_path(name)
        except HTTPException:
            path = None
        attachments.append((name, path))
    return verify_case_documents(attachments)


@router.get("/{email_id}/attachments/{index}")
def get_attachment(email_id: str, index: int):
    email = find_email(email_id)
    if index < 0 or index >= len(email.get("attachments", [])):
        raise HTTPException(404, "Attachment not found")
    path = attachment_path(email["attachments"][index])
    return FileResponse(path, filename=path.name)
