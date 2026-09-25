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
    return _openai_verdicts(settings.openai_verifier_model, INSTRUCTIONS, request_payload(audits, source_text), images)


def verify_openai_b(audits: list[FieldAudit], source_text: str, images: list[Path] | None = None) -> list[VerifierVerdict]:
    """Second independent OpenAI verifier, using its own configured model."""
    return _openai_verdicts(settings.openai_verifier_b_model, INSTRUCTIONS, request_payload(audits, source_text), images)


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
