#!/usr/bin/env python3
"""Summarize decisions and human-review work from an LLM verification audit."""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.hitl import build_review_queue


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit", type=Path)
    parser.add_argument("--output", type=Path, default=Path("exports/llm_verification_metrics.json"))
    args = parser.parse_args()
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    fields = [field for email in audit.get("emails", []) for field in email.get("fields", [])]
    decisions = Counter(field["decision"] for field in fields)
    routes = Counter(field["route"]["route"] for field in fields)
    review = [field for field in fields if field.get("requires_human_review")]
    queue = build_review_queue(audit)
    report = {
        "emails_processed": len(audit.get("emails", [])),
        "fields_processed": len(fields),
        "decision_counts": dict(sorted(decisions.items())),
        "route_counts": dict(sorted(routes.items())),
        "human_review_fields": len(review),
        "approved_rate": round(decisions["approved"] / len(fields), 4) if fields else 0.0,
        "review_queue": [{"email_id": item.email_id, "key": item.key, "decision": item.decision,
                          "reason": item.reason, "evidence": [ev.model_dump() for ev in item.evidence]}
                         for item in queue],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
