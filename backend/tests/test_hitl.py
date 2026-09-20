from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.schemas.hitl import HumanDecision
from app.schemas.llm_verification import Evidence, VerifierVerdict
from app.services.hitl import apply_human_decision, build_report, build_review_queue
from app.services.llm_verification import apply_verdicts, route_field


def verdict(model, side, status):
    return VerifierVerdict(
        model=model, key="consignee", side=side, status=status,
        evidence=Evidence(text="Consignee: Buyer Ltd", location="[email_001_SI.txt]", page=1,
                          source="text", label_seen="Consignee", value_seen="Buyer Ltd"),
    )


def audit_payload(record):
    return {"generated_at": datetime.now(timezone.utc).isoformat(),
            "emails": [{"email_id": "email_001", "fields": [record.model_dump()]}]}


def disputed_consignee():
    record = route_field(key="consignee", label="Consignee", si="Buyer Ltd", bl="Buyer Ltd")
    return apply_verdicts(record, [verdict("a", "si", "verified"), verdict("a", "bl", "verified")],
                          [verdict("b", "si", "not_found"), verdict("b", "bl", "verified")])


def test_queue_includes_evidence_and_reason_for_uncertain_fields():
    payload = audit_payload(disputed_consignee())
    queue = build_review_queue(payload)
    assert len(queue) == 1
    assert queue[0].email_id == "email_001"
    assert queue[0].key == "consignee"
    assert queue[0].evidence[0].text == "Consignee: Buyer Ltd"
    assert "Model-C" in queue[0].reason or "conflicting" in queue[0].reason


def test_report_keeps_placeholder_until_a_person_resolves():
    report = build_report(audit_payload(disputed_consignee()), "email_001")
    consignee = next(field for field in report.fields if field.key == "consignee")
    assert consignee.result == "unresolved"
    assert consignee.si_value == "[pending review]"
    assert report.status == "needs_review"


def test_human_confirm_updates_report_and_leaves_the_queue():
    payload = audit_payload(disputed_consignee())
    apply_human_decision(payload, HumanDecision(
        email_id="email_001", key="consignee", action="confirm",
        note="SI and BL both show Buyer Ltd.",
    ))
    assert build_review_queue(payload) == []
    report = build_report(payload, "email_001")
    consignee = next(field for field in report.fields if field.key == "consignee")
    assert consignee.result == "matched"
    assert consignee.si_value == "buyer ltd"
    assert report.status == "ok"
    assert report.human_resolutions == 1


def test_human_missing_stays_flagged_on_the_report():
    payload = audit_payload(disputed_consignee())
    apply_human_decision(payload, HumanDecision(
        email_id="email_001", key="consignee", action="missing",
        note="Required consignee is blank on both originals.",
    ))
    assert build_review_queue(payload) == []
    report = build_report(payload, "email_001")
    consignee = next(field for field in report.fields if field.key == "consignee")
    assert consignee.result == "unresolved"
    assert "blank on both originals" in consignee.note


def test_review_api_lists_queue_and_applies_a_correction(tmp_path, monkeypatch):
    path = tmp_path / "audit.json"
    from app.services.hitl import save_audit
    save_audit(path, audit_payload(disputed_consignee()))
    monkeypatch.setattr(settings, "verification_audit_path", path)
    with TestClient(create_app()) as client:
        queue = client.get("/api/v1/review").json()
        assert queue[0]["key"] == "consignee"
        assert queue[0]["evidence"]
        report = client.post("/api/v1/review/decisions", json={
            "email_id": "email_001", "key": "consignee", "action": "correct",
            "note": "Officer corrected consignee from the SI letterhead.",
            "si_value": "Buyer Limited", "bl_value": "Buyer Limited",
        }).json()
        assert report["status"] == "ok"
        assert report["fields"][0]["result"] == "matched"
        assert client.get("/api/v1/review").json() == []
