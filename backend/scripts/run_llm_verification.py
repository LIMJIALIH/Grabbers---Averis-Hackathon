#!/usr/bin/env python3
"""Run independent batched verification for extraction records with usable text.

OCR-recovery fields are intentionally left pending until page-image recovery is
implemented; this command never lets a text-only model approve those records.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.integrations.llm_verifiers import adjudicate_openai, verify_openai, verify_openai_b
from app.schemas.llm_verification import FieldAudit
from app.services.llm_verification import apply_adjudication, apply_verdicts, disputed_sides


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("extractions", type=Path)
    parser.add_argument("--email-id")
    parser.add_argument("--limit", type=int, default=1, help="Maximum emails to send; calibration-safe default is 1.")
    parser.add_argument("--output", type=Path, default=Path("exports/llm_verification_audit.json"))
    parser.add_argument("--live", action="store_true", help="Required before any provider call is made.")
    args = parser.parse_args()
    if not args.live:
        parser.error("Refusing to call providers without --live")
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    extractions = {email["email_id"]: email for email in json.loads(args.extractions.read_text(encoding="utf-8")).get("emails", [])}
    eligible = [
        email for email in plan.get("emails", [])
        if (not args.email_id or email["email_id"] == args.email_id)
        and any(field["route"]["route"] in {"single_side", "dual_side"} for field in email.get("fields", []))
    ]
    selected = eligible[:args.limit]
    output = []
    for email in selected:
        source = extractions[email["email_id"]]
        audits = [FieldAudit.model_validate(item) for item in email["fields"]]
        routed = [audit for audit in audits if audit.route.route in {"single_side", "dual_side"}]
        if routed:
            source_text = "\n\n".join(f"[{item['name']}]\n{item.get('text') or ''}" for item in source.get("attachments", []))
            images = [Path(page["image"]) for item in source.get("attachments", []) for page in item.get("ocr", {}).get("pages", [])]
            required_images = images if any(audit.route.requires_source_image for audit in routed) else []
            try:
                a = verify_openai(routed, source_text, required_images)
                b = verify_openai_b(routed, source_text, required_images)
            except Exception as exc:
                for audit in routed:
                    audit.decision = "needs_review"
                    audit.requires_human_review = True
                    audit.suggested_resolution = f"Verifier call failed ({type(exc).__name__}); retry this email after the provider is available."
                output.append({"email_id": email["email_id"], "fields": [audit.model_dump() for audit in audits]})
                continue
            for audit in routed:
                apply_verdicts(audit, [item for item in a if item.side in audit.route.applicable_sides and _matches(item, audit)],
                               [item for item in b if item.side in audit.route.applicable_sides and _matches(item, audit)])
            disputed = [audit for audit in routed if disputed_sides(audit)]
            if disputed:
                try:
                    c = adjudicate_openai(disputed, source_text, required_images)
                except Exception as exc:
                    for audit in disputed:
                        audit.decision = "needs_review"
                        audit.requires_human_review = True
                        audit.suggested_resolution = f"Model-C call failed ({type(exc).__name__}); send this field to human review."
                else:
                    for audit in disputed:
                        apply_adjudication(audit, [item for item in c if item.side in audit.route.applicable_sides and _matches(item, audit)])
        output.append({"email_id": email["email_id"], "fields": [audit.model_dump() for audit in audits]})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "emails": output}, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")


def _matches(verdict, audit: FieldAudit) -> bool:
    # Providers return the field key through their schema; reject unrequested keys.
    return verdict.key == audit.key


if __name__ == "__main__":
    main()
