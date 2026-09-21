"""Human review queue and report refresh after a person confirms or corrects a field."""

from datetime import datetime, timezone
from html import escape
from pathlib import Path

from app.schemas.hitl import ComparisonReport, HumanDecision, ReportField, ReviewItem
from app.schemas.llm_verification import FieldAudit, HumanResolution
from app.services.document_fields import FIELD_SPECS
from app.services.llm_verification import normalize_candidate, values_match

PENDING = "[pending review]"
ABSENT = "[not listed]"


def build_review_queue(audit: dict) -> list[ReviewItem]:
    """One queue item per field that still needs a person, with evidence and reason."""
    items = []
    for email in audit.get("emails", []):
        email_id = email["email_id"]
        for field in email.get("fields", []):
            record = FieldAudit.model_validate(field)
            if not record.requires_human_review:
                continue
            items.append(_item(email_id, record))
    return items


def apply_human_decision(audit: dict, decision: HumanDecision, resolved_at: str | None = None) -> dict:
    """Write the human decision onto the audit field and drop it from the review queue."""
    stamp = resolved_at or datetime.now(timezone.utc).isoformat()
    for email in audit.get("emails", []):
        if email.get("email_id") != decision.email_id:
            continue
        for index, field in enumerate(email.get("fields", [])):
            record = FieldAudit.model_validate(field)
            if record.key != decision.key:
                continue
            if not record.requires_human_review:
                raise ValueError(f"{decision.email_id}:{decision.key} is not in the review queue")
            email["fields"][index] = _resolve(record, decision, stamp).model_dump()
            return audit
        raise ValueError(f"Unknown field {decision.key} on {decision.email_id}")
    raise ValueError(f"Unknown email {decision.email_id}")


def build_report(audit: dict, email_id: str, generated_at: str | None = None) -> ComparisonReport:
    """Render the comparison report from cleaned audit fields, including human decisions."""
    email = next((item for item in audit.get("emails", []) if item.get("email_id") == email_id), None)
    if email is None:
        raise ValueError(f"Unknown email {email_id}")
    records = [FieldAudit.model_validate(field) for field in email.get("fields", [])]
    by_key = {item.key: item for item in records}
    fields = [_report_field(by_key[key], label) for key, label in FIELD_SPECS if key in by_key]
    unresolved = [_item(email_id, item) for item in records if item.requires_human_review]
    summary = ComparisonReport(
        email_id=email_id,
        generated_at=generated_at or audit.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        status="needs_review",
        matched=sum(field.result == "matched" for field in fields),
        mismatched=sum(field.result == "mismatch" for field in fields),
        unresolved=sum(field.result == "unresolved" for field in fields),
        fields=fields,
        unresolved_items=unresolved,
        human_resolutions=sum(item.human_resolution is not None for item in records),
    )
    if summary.unresolved:
        summary.status = "needs_review"
    elif summary.mismatched:
        summary.status = "mismatch"
    else:
        summary.status = "ok"
    return summary


def render_html(report: ComparisonReport) -> str:
    rows = "".join(
        f"<tr><td>{escape(field.label)}</td><td>{escape(field.si_value)}</td>"
        f"<td>{escape(field.bl_value)}</td><td>{escape(field.result)}</td>"
        f"<td>{escape(field.note or '')}</td></tr>"
        for field in report.fields
    )
    pending = "".join(
        f"<li><strong>{escape(item.label)}</strong>: {escape(item.reason)}"
        + ("".join(f"<br/><em>{escape(ev.text)}</em> ({escape(ev.location or 'source')})" for ev in item.evidence) or "")
        + "</li>"
        for item in report.unresolved_items
    ) or "<li>None</li>"
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>SI vs BL {escape(report.email_id)}</title>
<style>
body {{ font-family: Georgia, serif; margin: 2rem; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ border: 1px solid #ccc; padding: .4rem .6rem; text-align: left; vertical-align: top; }}
th {{ background: #f4f4f4; }}
</style></head><body>
<h1>SI vs BL comparison report</h1>
<p>Email {escape(report.email_id)} · {escape(report.generated_at)} · Status {escape(report.status)}</p>
<p>Matched {report.matched} · Mismatched {report.mismatched} · Unresolved {report.unresolved} · Human resolutions {report.human_resolutions}</p>
<table><thead><tr><th>Field</th><th>SI</th><th>BL</th><th>Result</th><th>Note</th></tr></thead>
<tbody>{rows}</tbody></table>
<h2>Unresolved items</h2><ul>{pending}</ul>
</body></html>
"""


def load_audit(path: Path) -> dict:
    import json
    return json.loads(path.read_text(encoding="utf-8"))


def save_audit(path: Path, audit: dict) -> None:
    import json
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")


def _item(email_id: str, record: FieldAudit) -> ReviewItem:
    evidence = [
        item.evidence for group in (record.verifier_a, record.verifier_b)
        for item in group if item.evidence and item.evidence.text
    ]
    return ReviewItem(
        email_id=email_id,
        key=record.key,
        label=record.label,
        decision=record.decision,
        reason=record.suggested_resolution or record.route.reason,
        candidates=record.candidates,
        evidence=evidence,
        verifier_a=record.verifier_a,
        verifier_b=record.verifier_b,
    )


def _resolve(record: FieldAudit, decision: HumanDecision, stamp: str) -> FieldAudit:
    if decision.action in {"correct"} and not (decision.si_value or decision.bl_value):
        raise ValueError("correct requires si_value or bl_value")
    if decision.action in {"confirm", "correct"} and not decision.note.strip():
        raise ValueError("Human confirmation needs a reason")
    if decision.action in {"missing", "unreadable"} and not decision.note.strip():
        raise ValueError("Human confirmation needs a reason")
    values = {item.side: item.normalized for item in record.candidates}
    if decision.si_value is not None:
        values["si"], _ = normalize_candidate(record.key, decision.si_value)
    if decision.bl_value is not None:
        values["bl"], _ = normalize_candidate(record.key, decision.bl_value)
    record.human_resolution = HumanResolution(
        action=decision.action, note=decision.note.strip(),
        si_value=values.get("si") or None, bl_value=values.get("bl") or None, resolved_at=stamp,
    )
    record.requires_human_review = False
    if decision.action == "missing":
        record.decision = "missing"
        record.final_value = None
        record.suggested_resolution = decision.note.strip()
        return record
    if decision.action == "unreadable":
        record.decision = "unreadable"
        record.final_value = None
        record.suggested_resolution = decision.note.strip()
        return record
    si, bl = values.get("si") or "", values.get("bl") or ""
    if si and bl and values_match(si, bl):
        record.decision = "approved"
        record.final_value = si
        record.suggested_resolution = decision.note.strip()
    else:
        record.decision = "document_mismatch"
        record.final_value = si or bl or None
        record.suggested_resolution = decision.note.strip()
    return record


def _report_field(record: FieldAudit, label: str) -> ReportField:
    if record.requires_human_review:
        return ReportField(key=record.key, label=label, si_value=PENDING, bl_value=PENDING,
                           result="unresolved", note=record.suggested_resolution or record.route.reason)
    if record.decision in {"missing", "unreadable", "mislabeled", "ambiguous", "needs_review"}:
        note = record.suggested_resolution or record.decision
        if record.human_resolution:
            note = record.human_resolution.note
        return ReportField(key=record.key, label=label, si_value=ABSENT, bl_value=ABSENT,
                           result="unresolved", note=note)
    values = {item.side: item.normalized for item in record.candidates}
    if record.human_resolution:
        if record.human_resolution.si_value:
            values["si"] = record.human_resolution.si_value
        if record.human_resolution.bl_value:
            values["bl"] = record.human_resolution.bl_value
    elif record.final_value and record.decision == "approved":
        values["si"] = values["bl"] = record.final_value
    si, bl = values.get("si") or ABSENT, values.get("bl") or ABSENT
    if si == ABSENT or bl == ABSENT or record.decision == "document_mismatch":
        result = "mismatch" if si != ABSENT or bl != ABSENT else "unresolved"
        if si != ABSENT and bl != ABSENT and not values_match(si, bl):
            result = "mismatch"
        elif si == ABSENT or bl == ABSENT:
            result = "mismatch"
        return ReportField(key=record.key, label=label, si_value=si, bl_value=bl, result=result,
                           note=record.suggested_resolution)
    if values_match(si, bl):
        return ReportField(key=record.key, label=label, si_value=si, bl_value=bl, result="matched",
                           note=record.suggested_resolution)
    return ReportField(key=record.key, label=label, si_value=si, bl_value=bl, result="mismatch",
                       note=record.suggested_resolution)
