#!/usr/bin/env python3
"""Recover `ocr_needed` PDF attachments and write an enriched extraction export."""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.document_fields import extract_fields_from_text
from app.services.ocr_recovery import recover_pdf


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--bundle-dir", type=Path, default=Path("resources"))
    parser.add_argument("--output", type=Path, default=Path("exports/attachment_extraction_ocr.json"))
    parser.add_argument("--images-dir", type=Path, default=Path("exports/ocr_pages"))
    parser.add_argument("--email-id", help="Recover one email while calibrating OCR.")
    parser.add_argument("--limit", type=int, help="Recover at most this many PDF attachments.")
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    recovered = attempted = 0
    for email in payload.get("emails", []):
        if args.email_id and email.get("email_id") != args.email_id:
            continue
        texts = {"si": "", "bl": ""}
        for attachment in email.get("attachments", []):
            side = "si" if Path(attachment["name"]).stem.upper().endswith("_SI") else "bl" if Path(attachment["name"]).stem.upper().endswith("_BL") else None
            if attachment.get("error") == "ocr_needed" and (args.limit is None or attempted < args.limit):
                source = (args.bundle_dir / attachment["path"]).resolve()
                attempted += 1
                try:
                    recovery = recover_pdf(source, args.images_dir / email["email_id"] / Path(attachment["name"]).stem)
                    attachment["text"] = recovery.pop("text")
                    attachment["ocr"] = recovery
                    attachment["error"] = None if attachment["text"] else "ocr_failed"
                    recovered += 1
                except Exception as exc:
                    attachment["error"] = f"ocr_failed: {type(exc).__name__}"
            if side:
                texts[side] = attachment.get("text") or ""
        if email.get("attachments"):
            email["comparison_fields"] = extract_fields_from_text(texts["si"], texts["bl"])
    payload["ocr_recovered_at"] = datetime.now(timezone.utc).isoformat()
    payload["ocr_recovered_attachments"] = recovered
    payload["ocr_attempted_attachments"] = attempted
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {args.output}; recovered {recovered} attachment(s)")


if __name__ == "__main__":
    main()
