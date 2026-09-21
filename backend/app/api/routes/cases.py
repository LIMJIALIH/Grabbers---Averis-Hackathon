import json
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.schemas.ingestion import ClassifiedEmail
from app.services.attachment_text import extract_attachment_text
from app.services.document_fields import extract_comparison_fields
from app.services.verification import process_email

router = APIRouter(prefix="/cases", tags=["cases"])


def inbox():
    directory = settings.bundle_dir / "inbox"
    if not directory.is_dir():
        raise HTTPException(503, "Sample inbox is unavailable. Configure DOCUVERIFY_BUNDLE_DIR.")
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(directory.glob("*.json"))]


def attachment_path(name: str) -> Path:
    root = (settings.bundle_dir / "attachments").resolve()
    path = (settings.bundle_dir / name).resolve()
    if not path.is_file():
        raise HTTPException(404, "Attachment not found")
    if not path.is_relative_to(root):
        raise HTTPException(404, "Attachment not found")
    return path


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
        comparison_fields = [] if not email_attachments else extract_comparison_fields(email_attachments, settings.bundle_dir)
        cases.append({
            "id": email["email_id"], "vessel": email.get("subject", "(No subject)"),
            "company": email.get("from", ""), "time": "", "kind": "Pending review",
            "state": "review", "fields": comparison_fields, "body": email.get("body", ""),
            "attachments": attachments, "extraction_source": "Text parser results",
        })
    return cases


@router.post("/{email_id}/extract")
def extract_case(email_id: str):
    """Run targeted Gemini native-PDF extraction for one review-queue email."""
    email = find_email(email_id)
    attachments = []
    for name in email.get("attachments", []):
        relative = Path(name)
        if relative.parts[:1] != ("attachments",):
            raise HTTPException(400, "Email attachment path is invalid")
        attachments.append({"filename": relative.name, "path": str(Path(*relative.parts[1:]))})
    tag = email.get("tag", "SI")
    if tag not in {"SI", "DL"}:
        tag = "SI"
    result = process_email(ClassifiedEmail(
        email_id=email_id, tag=tag, attachments=attachments,
    ), settings.bundle_dir / "attachments")
    return {
        "fields": result.fields,
        "extraction_status": result.extraction_status,
        "review_reasons": result.review_reasons,
        "extraction_source": "Gemini native PDF vision",
    }


@router.get("/{email_id}/attachments/{index}")
def get_attachment(email_id: str, index: int):
    email = find_email(email_id)
    if index < 0 or index >= len(email.get("attachments", [])):
        raise HTTPException(404, "Attachment not found")
    path = attachment_path(email["attachments"][index])
    return FileResponse(path, filename=path.name)
