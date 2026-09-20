from app.core.config import settings
from app.integrations.llm_verifiers import ADJUDICATOR_INSTRUCTIONS, INSTRUCTIONS, adjudication_payload
from app.schemas.llm_verification import Evidence, VerifierVerdict
from app.services.llm_verification import apply_adjudication, apply_verdicts, disputed_sides, route_field


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


def test_single_clean_side_becomes_document_mismatch_when_verified():
    audit = route_field(key="consignee", label="Consignee", si="3S PAPER PRODUCTS SDN BHD", bl="")
    assert audit.route.route == "single_side"
    result = apply_verdicts(audit, [verdict("a", "si", "verified")], [verdict("b", "si", "verified")])
    assert result.decision == "document_mismatch"
    assert not result.requires_human_review


def test_all_mixed_verdicts_route_to_review():
    audit = route_field(key="consignee", label="Consignee", si="Buyer", bl="Buyer")
    result = apply_verdicts(audit, [verdict("a", "si", "verified"), verdict("a", "bl", "verified")],
                            [verdict("b", "si", "not_found"), verdict("b", "bl", "verified")])
    assert result.decision == "needs_review"
    assert result.requires_human_review
    assert disputed_sides(result) == ["si"]


def test_model_c_can_approve_a_genuine_disagreement():
    audit = route_field(key="consignee", label="Consignee", si="Buyer Ltd", bl="Buyer Ltd")
    apply_verdicts(audit, [verdict("a", "si", "verified"), verdict("a", "bl", "verified")],
                   [verdict("b", "si", "not_found"), verdict("b", "bl", "verified")])
    result = apply_adjudication(audit, [verdict("gpt-5.4", "si", "verified")])
    assert result.decision == "approved"
    assert result.final_value == "buyer ltd"
    assert not result.requires_human_review
    assert result.adjudicator[0].model == "gpt-5.4"


def test_incomplete_model_c_stays_in_human_review():
    audit = route_field(key="consignee", label="Consignee", si="Buyer Ltd", bl="Buyer Ltd")
    apply_verdicts(audit, [verdict("a", "si", "verified"), verdict("a", "bl", "verified")],
                   [verdict("b", "si", "not_found"), verdict("b", "bl", "verified")])
    result = apply_adjudication(audit, [])
    assert result.decision == "needs_review"
    assert result.requires_human_review


def test_agreed_not_found_does_not_call_model_c():
    audit = route_field(key="consignee", label="Consignee", si="Buyer Ltd", bl="Buyer Ltd")
    result = apply_verdicts(audit, [verdict("a", "si", "not_found"), verdict("a", "bl", "not_found")],
                            [verdict("b", "si", "not_found"), verdict("b", "bl", "not_found")])
    assert result.decision == "missing"
    assert disputed_sides(result) == []


def test_adjudicator_uses_a_different_openai_model():
    assert settings.openai_adjudicator_model != settings.openai_verifier_model
    assert settings.openai_verifier_b_model != settings.openai_verifier_model
    assert settings.openai_adjudicator_model != settings.openai_verifier_b_model
    assert ADJUDICATOR_INSTRUCTIONS != INSTRUCTIONS
    audit = route_field(key="consignee", label="Consignee", si="Buyer Ltd", bl="Buyer Ltd")
    apply_verdicts(audit, [verdict("a", "si", "verified"), verdict("a", "bl", "verified")],
                   [verdict("b", "si", "not_found"), verdict("b", "bl", "verified")])
    payload = adjudication_payload([audit], "Consignee: Buyer Ltd")
    assert "disputed_fields" in payload
    assert "verifier_a" in payload
    assert "Buyer Ltd" in payload


def test_low_confidence_ocr_requires_image_for_both_verifiers():
    audit = route_field(key="gross_weight_kg", label="Gross Weight (kg)", si="21577", bl="21577", low_confidence_ocr=True)
    assert audit.route.requires_source_image
