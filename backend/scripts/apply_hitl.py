#!/usr/bin/env python3
"""Apply a human confirm/correct decision, then refresh that email's comparison report."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.hitl import HumanDecision
from app.services.hitl import apply_human_decision, build_report, load_audit, render_html, save_audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit", type=Path)
    parser.add_argument("--email-id", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--action", required=True, choices=["confirm", "correct", "missing", "unreadable"])
    parser.add_argument("--note", required=True, help="Why the person confirmed or corrected this field.")
    parser.add_argument("--si-value")
    parser.add_argument("--bl-value")
    parser.add_argument("--reports-dir", type=Path, default=Path("exports/reports"))
    args = parser.parse_args()
    audit = load_audit(args.audit)
    apply_human_decision(audit, HumanDecision(
        email_id=args.email_id, key=args.key, action=args.action, note=args.note,
        si_value=args.si_value, bl_value=args.bl_value,
    ))
    save_audit(args.audit, audit)
    report = build_report(audit, args.email_id)
    args.reports_dir.mkdir(parents=True, exist_ok=True)
    (args.reports_dir / f"{args.email_id}.json").write_text(json.dumps(report.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
    (args.reports_dir / f"{args.email_id}.html").write_text(render_html(report), encoding="utf-8")
    print(json.dumps(report.model_dump(), indent=2))
    print(f"Updated {args.audit} and {args.reports_dir / args.email_id}.html")


if __name__ == "__main__":
    main()
