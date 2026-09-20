"""Deterministic routing and decisions for independent LLM extraction checks.

Provider calls deliberately live behind an adapter.  This module never treats a
model response as truth without the required source evidence.
"""

import re
from collections.abc import Iterable

from app.schemas.llm_verification import (
    CandidateValue, Decision, FieldAudit, FieldSide, VerificationRoute,
    VerifierVerdict,
)
from app.services.document_fields import FIELD_ALIASES

HITL_DECISIONS = ("needs_review", "mislabeled", "missing", "unreadable", "ambiguous")


def normalize_candidate(key: str, raw: str) -> tuple[str, list[str]]:
    """Return a comparison value and an auditable list of rules that fired."""
    value = " ".join(raw.split())
    rules = ["collapse_whitespace"] if value != raw else []
    if key == "gross_weight_kg" and value:
        compact = value.replace(",", "")
        if compact != value:
            rules.append("remove_thousands_separator")
        # The existing extractor has already converted tonnes to kilograms.
        digits = "".join(character for character in compact if character.isdigit() or character == ".")
        if digits and digits != value:
            value = digits.rstrip("0").rstrip(".") if "." in digits else digits
            rules.append("kg_canonicalize")
    elif key == "container_count" and value:
        digits = "".join(character for character in value if character.isdigit())
        if digits and digits != value:
            value = digits
            rules.append("container_count_canonicalize")
    else:
        folded = value.casefold()
        if folded != value:
            value = folded
            rules.append("casefold")
    return value, rules


def route_field(
    *, key: str, label: str, si: str, bl: str,
    si_status: str = "ok", bl_status: str = "ok",
    low_confidence_ocr: bool = False,
) -> FieldAudit:
    """Apply Step 1 of the specification without spending model tokens."""
    si_normalized, si_rules = normalize_candidate(key, si)
    bl_normalized, bl_rules = normalize_candidate(key, bl)
    candidates = [
        CandidateValue(side="si", raw=si, normalized=si_normalized,
                       normalization_rules=si_rules, extraction_status=_status(si_status)),
        CandidateValue(side="bl", raw=bl, normalized=bl_normalized,
                       normalization_rules=bl_rules, extraction_status=_status(bl_status)),
    ]
    image = low_confidence_ocr
    if si_status == "missing" or bl_status == "missing":
        absent = "SI" if si_status == "missing" else "BL"
        route = VerificationRoute(key=key, label=label, route="hitl", applicable_sides=[],
                                  reason=f"{absent} attachment is missing; document comparison cannot be verified.")
    elif si_status != "ok" or bl_status != "ok":
        route = VerificationRoute(key=key, label=label, route="ocr_recovery", applicable_sides=[],
                                  reason="An attachment extraction is unavailable or requires OCR recovery.",
                                  requires_source_image=True)
    elif not si and not bl:
        route = VerificationRoute(key=key, label=label, route="hitl", applicable_sides=[],
                                  reason="Both documents are cleanly extracted but the field is blank.")
    elif not si or not bl:
        present: FieldSide = "bl" if not si else "si"
        route = VerificationRoute(key=key, label=label, route="single_side", applicable_sides=[present],
                                  reason="Only one cleanly extracted document contains a candidate value.",
                                  requires_source_image=image)
    else:
        route = VerificationRoute(key=key, label=label, route="dual_side", applicable_sides=["si", "bl"],
                                  reason="Both documents contain candidates and require independent verification.",
                                  requires_source_image=image)
    audit = FieldAudit(key=key, label=label, candidates=candidates, route=route)
    if route.route == "hitl":
        audit.decision = "missing"
        audit.suggested_resolution = ("Required SI or BL attachment is unavailable; obtain the missing document before verification."
                                      if "attachment is missing" in route.reason
                                      else "Both SI and BL are blank after clean extraction; confirm whether this required field is absent.")
        audit.requires_human_review = True
    return audit


def decide_side(a: VerifierVerdict, b: VerifierVerdict) -> tuple[Decision, str | None, bool]:
    """Resolve every paired-verdict combination for one document side."""
    a = accept_known_alias(a)
    b = accept_known_alias(b)
    if a.status == b.status == "verified":
        return "approved", None, False
    if a.status == b.status == "incorrect" and a.corrected_normalized == b.corrected_normalized:
        return "auto_corrected", a.corrected_normalized, False
    if a.status == b.status == "mislabeled":
        return "mislabeled", None, True
    if a.status == b.status == "not_found":
        return "missing", None, True
    if a.status == b.status == "unreadable":
        return "unreadable", None, True
    if a.status == b.status == "ambiguous":
        return "ambiguous", None, True
    # Every mixed pair (including verified/incorrect and incorrect/not_found)
    # is deliberately defined rather than allowed to fall through.
    return "needs_review", None, True


def disputed_sides(audit: FieldAudit) -> list[FieldSide]:
    """Return sides where complete A/B verdicts disagree and need Model-C."""
    expected = set(audit.route.applicable_sides)
    a_by_side = {item.side: item for item in audit.verifier_a}
    b_by_side = {item.side: item for item in audit.verifier_b}
    if set(a_by_side) != expected or set(b_by_side) != expected:
        return []
    return [side for side in expected if decide_side(a_by_side[side], b_by_side[side])[0] == "needs_review"]


def apply_verdicts(audit: FieldAudit, a: Iterable[VerifierVerdict], b: Iterable[VerifierVerdict]) -> FieldAudit:
    """Apply independent responses and identify document mismatches.

    Callers must pass exactly one verdict from each verifier for every routed
    side; rejecting incomplete responses prevents accidental approval.
    """
    audit.verifier_a = list(a)
    audit.verifier_b = list(b)
    expected = set(audit.route.applicable_sides)
    a_by_side = {item.side: item for item in audit.verifier_a}
    b_by_side = {item.side: item for item in audit.verifier_b}
    if set(a_by_side) != expected or set(b_by_side) != expected:
        audit.decision = "needs_review"
        audit.requires_human_review = True
        audit.suggested_resolution = "One or both verifier responses are incomplete; rerun the disputed field."
        return audit
    if disputed_sides(audit):
        audit.decision = "needs_review"
        audit.requires_human_review = True
        audit.suggested_resolution = "Evidence is conflicting; send only this field to Model-C."
        return audit
    outcomes = {side: decide_side(a_by_side[side], b_by_side[side]) for side in expected}
    return _finalize_field(audit, outcomes)


def apply_adjudication(audit: FieldAudit, c: Iterable[VerifierVerdict]) -> FieldAudit:
    """Resolve A/B disagreements with Model-C. Incomplete C stays in HITL."""
    sides = set(disputed_sides(audit))
    audit.adjudicator = [item for item in c if item.key == audit.key and item.side in audit.route.applicable_sides]
    if not sides:
        return audit
    c_by_side = {item.side: item for item in audit.adjudicator}
    if set(c_by_side) < sides:
        audit.decision = "needs_review"
        audit.requires_human_review = True
        audit.suggested_resolution = "Model-C response is incomplete; send this field to human review."
        return audit
    a_by_side = {item.side: item for item in audit.verifier_a}
    b_by_side = {item.side: item for item in audit.verifier_b}
    outcomes = {}
    for side in audit.route.applicable_sides:
        if side in sides:
            verdict = c_by_side[side]
            outcomes[side] = decide_side(verdict, verdict)
        else:
            outcomes[side] = decide_side(a_by_side[side], b_by_side[side])
    result = _finalize_field(audit, outcomes)
    if not result.requires_human_review:
        result.suggested_resolution = "Model-C resolved the verifier disagreement from source evidence."
    return result


def _finalize_field(audit: FieldAudit, outcomes: dict[FieldSide, tuple[Decision, str | None, bool]]) -> FieldAudit:
    HITL_DECISIONS = ("needs_review", "mislabeled", "missing", "unreadable", "ambiguous")
    hitl = [outcome[0] for outcome in outcomes.values() if outcome[0] in HITL_DECISIONS]
    if hitl:
        audit.decision = "needs_review" if "needs_review" in hitl else hitl[0]
        audit.requires_human_review = True
        audit.suggested_resolution = "Evidence is conflicting or incomplete; send only this field to human review."
        return audit
    values = {candidate.side: candidate.normalized for candidate in audit.candidates}
    for side, (decision, corrected, _) in outcomes.items():
        if decision == "auto_corrected" and corrected:
            values[side] = corrected
    if audit.route.route == "single_side":
        audit.decision = "document_mismatch"
        audit.final_value = values[audit.route.applicable_sides[0]]
        audit.requires_human_review = False
        audit.suggested_resolution = "Present-side value is verified; the cleanly extracted opposite document does not list this field."
    elif values["si"] != values["bl"]:
        audit.decision = "document_mismatch"
        audit.requires_human_review = False
        audit.suggested_resolution = "Both document-side values are verified but differ; review as a document mismatch."
    else:
        audit.decision = "approved"
        audit.final_value = values["si"]
        audit.requires_human_review = False
        audit.suggested_resolution = None
    return audit


def accept_known_alias(item: VerifierVerdict) -> VerifierVerdict:
    """Treat a listed heading as the requested field instead of mislabeled."""
    if item.status == "mislabeled" and label_is_alias(item.key, item.evidence.label_seen):
        return item.model_copy(update={"status": "verified"})
    return item


def label_is_alias(key: str, label_seen: str | None) -> bool:
    seen = _fold_label(label_seen or "")
    if not seen:
        return False
    for alias in FIELD_ALIASES.get(key, []):
        folded = _fold_label(alias)
        if not folded:
            continue
        if seen == folded or seen.startswith(folded + " ") or folded.startswith(seen + " "):
            return True
    return False


def _fold_label(value: str) -> str:
    value = re.sub(r"\([^)]*\)", " ", value)
    return " ".join(value.replace("/", " ").replace("-", " ").casefold().split())


def refresh_field(audit: FieldAudit) -> FieldAudit:
    """Recompute decisions from stored A/B/C verdicts after alias or finalize fixes."""
    stored_c = list(audit.adjudicator)
    apply_verdicts(audit, audit.verifier_a, audit.verifier_b)
    if disputed_sides(audit) and stored_c:
        apply_adjudication(audit, stored_c)
    return audit


def _status(value: str) -> str:
    return value if value in {"ok", "ocr_needed", "failed", "missing"} else "failed"
