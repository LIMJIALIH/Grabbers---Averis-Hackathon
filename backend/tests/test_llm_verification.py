from app.core.config import settings

from app.integrations.llm_verifiers import INSTRUCTIONS
from app.schemas.llm_verification import Evidence, VerifierVerdict
from app.services.llm_verification import apply_verdicts, normalize_candidate, route_field


def verdict(model, side, status, corrected=None):
    return VerifierVerdict(model=model, key="consignee", side=side, status=status,
                           corrected_normalized=corrected,
                           evidence=Evidence(text="Consignee: Buyer Ltd", location="page:1", page=1, source="text", label_seen="Consignee", value_seen="Buyer Ltd"))


def test_pre_routing_skips_models_for_both_cleanly_blank_values():
    audit = route_field(key="consignee", label="Consignee", si="", bl="")
    assert audit.route.route == "hitl"
    assert audit.decision == "missing"
    assert audit.requires_human_review


def test_missing_attachment_routes_directly_to_hitl_not_ocr_or_image_verification():
    audit = route_field(key="consignee", label="Consignee", si="Buyer Ltd", bl="", bl_status="missing")
    assert audit.route.route == "hitl"
    assert not audit.route.requires_source_image
    assert audit.decision == "missing"
    assert "attachment is unavailable" in audit.suggested_resolution


def test_single_clean_side_document_mismatch_requires_human_review():
    audit = route_field(key="consignee", label="Consignee", si="3S PAPER PRODUCTS SDN BHD", bl="")
    assert audit.route.route == "single_side"
    result = apply_verdicts(audit, [verdict("a", "si", "verified")], [verdict("b", "si", "verified")])
    assert result.decision == "document_mismatch"
    assert result.requires_human_review


def test_verified_document_mismatch_requires_human_review():
    audit = route_field(key="consignee", label="Consignee", si="Buyer SI", bl="Buyer BL")
    def value_verdict(model, side, value):
        return VerifierVerdict(
            model=model, key="consignee", side=side, status="verified",
            evidence=Evidence(text=f"Consignee: {value}", source="text", label_seen="Consignee", value_seen=value),
        )
    result = apply_verdicts(audit, [value_verdict("a", "si", "Buyer SI"), value_verdict("a", "bl", "Buyer BL")],
                            [value_verdict("b", "si", "Buyer SI"), value_verdict("b", "bl", "Buyer BL")])
    assert result.decision == "document_mismatch"
    assert result.requires_human_review


def test_agreed_source_evidence_repairs_a_label_fragment_before_comparison():
    audit = route_field(
        key="notify_party", label="Notify Party",
        si="/Intermediate Consignee: PACIFIC OFFICE (M) SDN BHD",
        bl="PACIFIC OFFICE (M) SDN BHD",
    )
    def source_verdict(model, side, label):
        return VerifierVerdict(
            model=model, key="notify_party", side=side, status="verified",
            evidence=Evidence(
                text=f"{label}: PACIFIC OFFICE (M) SDN BHD", source="text",
                label_seen=label, value_seen="PACIFIC OFFICE (M) SDN BHD",
            ),
        )
    result = apply_verdicts(
        audit,
        [source_verdict("a", "si", "Notify Party/Intermediate Consignee"), source_verdict("a", "bl", "Notify Party")],
        [source_verdict("b", "si", "Notify Party/Intermediate Consignee"), source_verdict("b", "bl", "Notify Party")],
    )
    assert result.decision == "approved"
    assert result.final_value == "pacific office (m) sdn bhd"


def test_all_mixed_verdicts_route_to_review():
    audit = route_field(key="consignee", label="Consignee", si="Buyer SI", bl="Buyer BL")
    result = apply_verdicts(audit, [verdict("a", "si", "verified"), verdict("a", "bl", "verified")],
                            [verdict("b", "si", "not_found"), verdict("b", "bl", "verified")])
    assert result.decision == "needs_review"
    assert result.requires_human_review
    assert "human review" in result.suggested_resolution


def test_matching_normalized_values_skip_llm_verification():
    audit = route_field(key="shipper", label="Shipper", si="APRIL FAR EAST (M) SDN BHD", bl="april/far-east (m) sdn_bhd")
    assert audit.route.route == "skip"
    assert audit.route.applicable_sides == []
    assert audit.decision == "approved"
    assert audit.final_value == "april far east (m) sdn bhd"
    assert not audit.requires_human_review


def test_agreed_not_found_stays_in_human_review():
    audit = route_field(key="consignee", label="Consignee", si="Buyer SI", bl="Buyer BL")
    result = apply_verdicts(audit, [verdict("a", "si", "not_found"), verdict("a", "bl", "not_found")],
                            [verdict("b", "si", "not_found"), verdict("b", "bl", "not_found")])
    assert result.decision == "missing"
    assert result.decision == "missing"


def test_verifiers_use_different_openai_models():
    assert settings.openai_verifier_model != settings.openai_verifier_b_model
    assert "evidence-only" in INSTRUCTIONS


def test_field_normalization_casefolds_then_normalizes_whitespace_and_separators():
    normalized, rules = normalize_candidate("consignee", "  ACME/Trading--Sdn_Bhd  ")
    assert normalized == "acme trading sdn bhd"
    assert rules == ["casefold", "normalize_whitespace", "normalize_separators"]


def test_low_confidence_ocr_requires_image_for_both_verifiers():
    audit = route_field(key="gross_weight_kg", label="Gross Weight (kg)", si="21577", bl="21577", low_confidence_ocr=True)
    assert audit.route.requires_source_image
