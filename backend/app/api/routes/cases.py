import json
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings

router = APIRouter(prefix="/cases", tags=["cases"])


def inbox():
    directory = settings.bundle_dir / "inbox"
    if not directory.is_dir():
        raise HTTPException(503, "Sample inbox is unavailable. Configure DOCUVERIFY_BUNDLE_DIR.")
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(directory.glob("*.json"))]


def attachment_path(name: str) -> Path:
    root = (settings.bundle_dir / "attachments").resolve()
    path = (settings.bundle_dir / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "Attachment not found")
    return path


@router.get("")
def list_cases():
    cases = []
    for email in inbox():
        attachments = []
        for index, name in enumerate(email.get("attachments", [])):
            try:
                path = attachment_path(name)
            except HTTPException:
                attachments.append({"name": Path(name).name, "url": None, "text": None})
                continue
            attachments.append({
                "name": path.name,
                "url": f"/api/v1/cases/{quote(email['email_id'], safe='')}/attachments/{index}",
                "text": path.read_text(encoding="utf-8", errors="replace") if path.suffix.lower() == ".txt" else None,
            })
        cases.append({
            "id": email["email_id"], "vessel": email.get("subject", "(No subject)"),
            "company": email.get("from", ""), "time": "", "kind": "Pending review",
            "state": "review", "fields": [], "body": email.get("body", ""),
            "attachments": attachments,
        })
    return cases


@router.get("/{email_id}/attachments/{index}")
def get_attachment(email_id: str, index: int):
    email = next((item for item in inbox() if item["email_id"] == email_id), None)
    if email is None or index < 0 or index >= len(email.get("attachments", [])):
        raise HTTPException(404, "Attachment not found")
    path = attachment_path(email["attachments"][index])
    return FileResponse(path, filename=path.name)
