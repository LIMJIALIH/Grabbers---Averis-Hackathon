#!/usr/bin/env python3
"""Export the HITL queue: unreadable, missing, or still-uncertain fields plus evidence."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.hitl import build_review_queue, load_audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit", type=Path)
    parser.add_argument("--output", type=Path, default=Path("exports/hitl_queue.json"))
    args = parser.parse_args()
    items = [item.model_dump() for item in build_review_queue(load_audit(args.audit))]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"items": items, "count": len(items)}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {args.output} ({len(items)} items)")


if __name__ == "__main__":
    main()
