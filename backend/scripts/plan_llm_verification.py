#!/usr/bin/env python3
"""Create a no-cost LLM-verification routing audit from extraction JSON."""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow the documented ``python scripts/<script>.py`` invocation from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.llm_verification import route_field


def attachment_status(email: dict, side: str) -> str:
    suffix = f"_{side.upper()}"
    matches = [item for item in email.get("attachments", []) if Path(str(item.get("name", ""))).stem.upper().endswith(suffix)]
    if not matches:
        return "missing"
    error = matches[0].get("error")
    return "ocr_needed" if error == "ocr_needed" else "failed" if error else "ok"


def low_confidence_ocr(email: dict, side: str, key: str, threshold: float) -> bool:
    suffix = f"_{side.upper()}"
    for item in email.get("attachments", []):
        if Path(str(item.get("name", ""))).stem.upper().endswith(suffix) and item.get("ocr"):
            return float(item["ocr"].get("field_confidence", {}).get(key, 0)) < threshold
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("exports/llm_verification_plan.json"))
    parser.add_argument("--ocr-confidence-threshold", type=float, default=85.0)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    emails = []
    for email in payload.get("emails", []):
        audits = [route_field(key=field["key"], label=field["label"], si=field.get("si", ""), bl=field.get("bl", ""),
                              si_status=attachment_status(email, "si"), bl_status=attachment_status(email, "bl"),
                              low_confidence_ocr=low_confidence_ocr(email, "si", field["key"], args.ocr_confidence_threshold)
                              or low_confidence_ocr(email, "bl", field["key"], args.ocr_confidence_threshold)).model_dump()
                  for field in email.get("comparison_fields", [])]
        emails.append({"email_id": email.get("email_id"), "fields": audits})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "emails": emails}, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
