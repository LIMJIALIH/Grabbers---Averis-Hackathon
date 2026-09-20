from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.hitl import HumanDecision
from app.services.hitl import apply_human_decision, build_report, build_review_queue, load_audit, render_html, save_audit

router = APIRouter(prefix="/review", tags=["review"])


def _audit() -> dict:
    path = settings.verification_audit_path
    if not path.is_file():
        raise HTTPException(404, f"Verification audit not found: {path}")
    return load_audit(path)


@router.get("")
def list_review_queue(email_id: str | None = None):
    items = build_review_queue(_audit())
    if email_id:
        items = [item for item in items if item.email_id == email_id]
    return [item.model_dump() for item in items]


@router.get("/{email_id}/report")
def get_report(email_id: str, format: str = "json"):
    report = build_report(_audit(), email_id)
    if format == "html":
        from fastapi.responses import HTMLResponse
        return HTMLResponse(render_html(report))
    return report.model_dump()


@router.post("/decisions")
def submit_decision(decision: HumanDecision):
    path = settings.verification_audit_path
    audit = _audit()
    try:
        apply_human_decision(audit, decision)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    save_audit(path, audit)
    return build_report(audit, decision.email_id).model_dump()
