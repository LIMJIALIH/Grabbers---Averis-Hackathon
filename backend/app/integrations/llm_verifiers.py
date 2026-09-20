"""Independent OpenAI adapters for evidence-grounded verification."""

import base64
import json
from pathlib import Path

from app.core.config import settings
from app.schemas.llm_verification import FieldAudit, VerifierResponse, VerifierVerdict


INSTRUCTIONS = """You are an evidence-only shipping-document extraction verifier.
For every requested field-side candidate, confirm BOTH the requested field label (or a
listed alias) and the candidate value against the supplied source text or image.
Treat every name in `aliases` as the same field. Examples: "To the Order of" is
Consignee; "Notify Party/Intermediate Consignee" is Notify Party. Return `mislabeled`
only when the value appears under a different field that is not in aliases. Never invent
a value. Every verdict needs a short verbatim evidence quote, a location/page when
available, the label you saw, the value you saw, and source (`text` or
`image`). Return JSON only, following the supplied schema."""

ADJUDICATOR_INSTRUCTIONS = """You are Model-C, an evidence-only adjudicator.
Two independent verifiers disagreed. Re-check ONLY the disputed field-sides against
the source text or image. Do not prefer a verifier by name or model. Do not invent a
value. Treat listed aliases as the requested field (for example "To the Order of" is
Consignee; "Notify Party/Intermediate Consignee" is Notify Party). You may agree with A,
agree with B, or reject both. Return the same verdict schema as a verifier, with a
verbatim evidence quote, location/page, label seen, value seen, and source (`text` or
`image`). Return JSON only."""


def request_payload(audits: list[FieldAudit], source_text: str) -> str:
    from app.services.document_fields import FIELD_ALIASES

    fields = []
    for audit in audits:
        for candidate in audit.candidates:
            if candidate.side in audit.route.applicable_sides:
                fields.append({"key": audit.key, "label": audit.label, "side": candidate.side,
                               "aliases": FIELD_ALIASES.get(audit.key, []),
                               "candidate_raw": candidate.raw, "candidate_normalized": candidate.normalized})
    return json.dumps({"fields_to_verify": fields, "source_text": source_text}, ensure_ascii=False)


def _openai_content(prompt: str, images: list[Path]) -> list[dict[str, str]]:
    content: list[dict[str, str]] = [{"type": "input_text", "text": prompt}]
    for image in images:
        encoded = base64.b64encode(image.read_bytes()).decode("ascii")
        content.append({"type": "input_image", "image_url": f"data:image/png;base64,{encoded}", "detail": "high"})
    return content


def verify_openai(audits: list[FieldAudit], source_text: str, images: list[Path] | None = None) -> list[VerifierVerdict]:
    """One structured OpenAI request for every routed field in an email."""
    _require_distinct_models()
    return _openai_verdicts(settings.openai_verifier_model, INSTRUCTIONS, request_payload(audits, source_text), images)


def verify_openai_b(audits: list[FieldAudit], source_text: str, images: list[Path] | None = None) -> list[VerifierVerdict]:
    """Second independent OpenAI verifier, using a different model than A or C."""
    _require_distinct_models()
    return _openai_verdicts(settings.openai_verifier_b_model, INSTRUCTIONS, request_payload(audits, source_text), images)


def adjudicate_openai(audits: list[FieldAudit], source_text: str, images: list[Path] | None = None) -> list[VerifierVerdict]:
    """One OpenAI adjudication request for A/B disagreements, using a different model."""
    _require_distinct_models()
    return _openai_verdicts(
        settings.openai_adjudicator_model,
        ADJUDICATOR_INSTRUCTIONS,
        adjudication_payload(audits, source_text),
        images,
        max_output_tokens=4000,
    )


def adjudication_payload(audits: list[FieldAudit], source_text: str) -> str:
    from app.services.document_fields import FIELD_ALIASES
    from app.services.llm_verification import disputed_sides

    disputed = []
    for audit in audits:
        a_by_side = {item.side: item for item in audit.verifier_a}
        b_by_side = {item.side: item for item in audit.verifier_b}
        candidates = {item.side: item for item in audit.candidates}
        for side in disputed_sides(audit):
            disputed.append({
                "key": audit.key,
                "label": audit.label,
                "side": side,
                "candidate_raw": candidates[side].raw,
                "candidate_normalized": candidates[side].normalized,
                "aliases": FIELD_ALIASES.get(audit.key, []),
                "verifier_a": a_by_side[side].model_dump(),
                "verifier_b": b_by_side[side].model_dump(),
            })
    return json.dumps({"disputed_fields": disputed, "source_text": source_text}, ensure_ascii=False)


def _require_distinct_models() -> None:
    models = (settings.openai_verifier_model, settings.openai_verifier_b_model, settings.openai_adjudicator_model)
    if len(set(models)) != 3:
        raise RuntimeError("Verifiers A/B and Model-C must use three different OpenAI models")


def _openai_verdicts(
    model: str,
    instructions: str,
    prompt: str,
    images: list[Path] | None,
    max_output_tokens: int = 3000,
) -> list[VerifierVerdict]:
    if not settings.openai_api_key:
        raise RuntimeError("DOCUVERIFY_OPENAI_API_KEY is not configured")
    from openai import OpenAI

    response = OpenAI(api_key=settings.openai_api_key.get_secret_value()).responses.parse(
        model=model,
        instructions=instructions,
        input=[{"role": "user", "content": _openai_content(prompt, images or [])}],
        text_format=VerifierResponse,
        max_output_tokens=max_output_tokens,
        store=False,
    )
    if response.output_parsed is None:
        raise RuntimeError("OpenAI returned no structured verifier response")
    return [item.model_copy(update={"model": model}) for item in response.output_parsed.verdicts]
