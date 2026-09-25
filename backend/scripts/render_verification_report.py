#!/usr/bin/env python3
"""Render SI vs BL reports from a verification audit (cleaned fields only)."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.hitl import build_report, load_audit, render_html


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit", type=Path)
    parser.add_argument("--email-id")
    parser.add_argument("--output-dir", type=Path, default=Path("exports/reports"))
    args = parser.parse_args()
    audit = load_audit(args.audit)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    ids = [args.email_id] if args.email_id else [email["email_id"] for email in audit.get("emails", [])]
    for email_id in ids:
        report = build_report(audit, email_id)
        (args.output_dir / f"{email_id}.json").write_text(json.dumps(report.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
        (args.output_dir / f"{email_id}.html").write_text(render_html(report), encoding="utf-8")
        print(f"{email_id}: {report.status} (unresolved {report.unresolved})")


if __name__ == "__main__":
    main()
