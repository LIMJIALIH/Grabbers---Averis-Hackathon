"""Self-check: python backend/data_prep/test_pipeline.py

The organisers planted 20 edge cases (email_501..520), 5 per review_reason.
If the pipeline drifts, this is what notices.
"""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_dataset import build, classify
from fields import canon, parse

BUNDLE = Path(__file__).resolve().parents[1] / "resources" / "sdoc-hackathon-bundle"


def test_field_parsing():
    si = parse(Path(BUNDLE / "attachments/email_004_SI.txt").read_text(encoding="utf-8"))
    assert canon("consignee", si["consignee"]) == "EAST BRIGHT", si
    assert canon("container_count", si["container_count"]) == 6
    assert canon("gross_weight_kg", si["gross_weight_kg"]) == 131058.0
    # "Port of Loading (POL)" and "Load Port" must land on the same field
    assert canon("port_of_loading", si["port_of_loading"]) == "NANTONG CHINA"


def test_classifier_rules_cover_the_inbox():
    fallbacks = [f.stem for f in sorted(BUNDLE.glob("inbox/*.json"))
                 if classify(__import__("json").loads(f.read_text(encoding="utf-8")))[1].startswith("fallback")]
    assert not fallbacks, f"unclassified by rule: {fallbacks}"


def test_planted_edge_cases(rows):
    got = {r["email_id"]: (r["status"], r["review_reason"]) for r in rows}
    for i in range(501, 506):
        assert got[f"email_{i}"] == ("NEEDS_REVIEW", "wrong_doc_type"), (i, got[f"email_{i}"])
    for i in range(506, 511):
        assert got[f"email_{i}"] == ("NEEDS_REVIEW", "missing_attachment"), (i, got[f"email_{i}"])
    for i in range(511, 516):
        assert got[f"email_{i}"] == ("NEEDS_REVIEW", "unreadable"), (i, got[f"email_{i}"])
    for i in range(516, 521):
        assert got[f"email_{i}"] == ("NEEDS_REVIEW", "missing_value"), (i, got[f"email_{i}"])


def test_no_silent_extraction_holes(rows):
    """A comparable pair must yield all 7 fields on both sides, or be NEEDS_REVIEW."""
    bad = [r["email_id"] for r in rows
           if r["status"] in ("OK", "MISMATCH") and r["category"] == "BL_COMPARISON"
           and any(r[f"{k}_{f}"] == "" for k in ("si", "bl") for f in
                   ("shipper", "consignee", "notify_party", "port_of_loading",
                    "port_of_discharge", "container_count", "gross_weight_kg"))]
    assert not bad, bad


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        rows = build(BUNDLE, tmp, 20, 42)
    test_field_parsing()
    test_classifier_rules_cover_the_inbox()
    test_planted_edge_cases(rows)
    test_no_silent_extraction_holes(rows)
    assert len(rows) == 520
    assert sum(r["split"] == "holdout" for r in rows) == 20
    print("ok:", len(rows), "emails,",
          dict(Counter(r["category"] for r in rows)),
          dict(Counter(r["status"] for r in rows)))
