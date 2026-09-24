#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow the documented ``python scripts/<script>.py`` invocation from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.services.attachment_text import extract_attachment_text
from app.services.document_fields import extract_comparison_fields


def _attachment_error(
    bundle_dir: Path,
    attachment_name: str,
    attachment_path: Path,
    text: str | None,
    exception: Exception | None = None,
) -> str | None:
    attachments_root = (bundle_dir / "attachments").resolve()
    if not attachment_path.is_file():
        return "missing_attachment"
    if not attachment_path.is_relative_to(attachments_root):
        return "invalid_attachment_path"
    if exception is not None:
        return f"extraction_failed: {type(exception).__name__}"
    if not text:
        if attachment_path.suffix.lower() == ".pdf":
            return "ocr_needed"
        return "unreadable"
    return None


def load_inbox(bundle_dir: Path) -> list[dict[str, object]]:
    inbox_dir = bundle_dir / "inbox"
    if not inbox_dir.is_dir():
        raise FileNotFoundError(f"Inbox directory not found: {inbox_dir}")
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(inbox_dir.glob("email_*.json"))]


def export_bundle(bundle_dir: Path) -> dict[str, object]:
    emails: list[dict[str, object]] = []
    for email in load_inbox(bundle_dir):
        email_attachments = list(email.get("attachments", []))
        attachment_records: list[dict[str, object]] = []
        for attachment_name in email_attachments:
            attachment_path = (bundle_dir / attachment_name).resolve()
            text = None
            error = None
            if attachment_path.is_file() and attachment_path.is_relative_to((bundle_dir / "attachments").resolve()):
                try:
                    text = extract_attachment_text(attachment_path)
                except Exception as exc:  # pragma: no cover - surfaced in export output
                    error = _attachment_error(bundle_dir, attachment_name, attachment_path, None, exc)
            else:
                error = _attachment_error(bundle_dir, attachment_name, attachment_path, None)
            record: dict[str, object] = {
                "name": Path(attachment_name).name,
                "path": attachment_name,
                "exists": attachment_path.is_file(),
                "type": attachment_path.suffix.lower().lstrip(".") or None,
                "text": text,
                "error": error,
            }
            if error is None and text is not None:
                record["error"] = _attachment_error(bundle_dir, attachment_name, attachment_path, text)
            attachment_records.append(record)

        emails.append(
            {
                "email_id": email["email_id"],
                "subject": email.get("subject", ""),
                "from": email.get("from", ""),
                "attachments": attachment_records,
                "comparison_fields": [] if not email_attachments else extract_comparison_fields(email_attachments, bundle_dir),
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bundle_dir": str(bundle_dir),
        "emails": emails,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export extracted attachment text and comparison fields to JSON.")
    parser.add_argument(
        "--bundle-dir",
        default=str(settings.bundle_dir),
        help="Path to the bundle root that contains inbox/ and attachments/",
    )
    parser.add_argument(
        "--output",
        default="exports/attachment_extraction.json",
        help="Output JSON file path",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bundle_dir = Path(args.bundle_dir).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = export_bundle(bundle_dir)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
