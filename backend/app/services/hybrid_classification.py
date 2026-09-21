"""Confidence-gated BERT classification with a hosted Gemma fallback."""

from app.core.config import settings
from app.schemas.classification import ClassificationResponse, EmailCategory
from app.services.gemma_email import GemmaEmailError, GemmaEmailGateway


def _threshold(category: EmailCategory) -> float:
    return {
        "BL_COMPARISON": settings.classification_threshold_bl_comparison,
        "SI_REQUEST": settings.classification_threshold_si_request,
        "INVOICE_QUERY": settings.classification_threshold_invoice_query,
        "GENERAL": settings.classification_threshold_general,
        "SPAM": settings.classification_threshold_spam,
    }[category]


def classify_with_fallback(
    bert,
    gemma: GemmaEmailGateway,
    subject: str,
    body: str,
    attachment_names: list[str] | None = None,
) -> ClassificationResponse:
    prediction = bert.predict(subject, body)
    ranked = sorted(prediction.scores.values(), reverse=True)
    margin = prediction.confidence - (ranked[1] if len(ranked) > 1 else 0.0)
    reasons = []
    if prediction.confidence < _threshold(prediction.category):
        reasons.append(
            f"BERT confidence {prediction.confidence:.3f} is below the {prediction.category} threshold"
        )
    if margin < settings.classification_min_margin:
        reasons.append(f"BERT top-two margin {margin:.3f} is too small")
    if not reasons:
        return prediction.model_copy(update={
            "source": "bert",
            "bert_category": prediction.category,
            "bert_confidence": prediction.confidence,
        })

    reason = "; ".join(reasons)
    if not gemma.available:
        return prediction.model_copy(update={
            "source": "bert_low_confidence",
            "bert_category": prediction.category,
            "bert_confidence": prediction.confidence,
            "requires_human_review": True,
            "fallback_reason": f"{reason}; Gemma is not configured",
        })
    try:
        fallback = gemma.classify(subject, body, attachment_names or [])
    except GemmaEmailError as exc:
        return prediction.model_copy(update={
            "source": "bert_low_confidence",
            "bert_category": prediction.category,
            "bert_confidence": prediction.confidence,
            "requires_human_review": True,
            "fallback_reason": f"{reason}; {exc}",
        })

    disagrees = fallback.category != prediction.category
    low_llm_confidence = fallback.confidence < settings.classification_llm_min_confidence
    return prediction.model_copy(update={
        "category": fallback.category,
        "confidence": fallback.confidence,
        "source": "gemma_fallback",
        "bert_category": prediction.category,
        "bert_confidence": prediction.confidence,
        "requires_human_review": disagrees or low_llm_confidence,
        "fallback_reason": reason + (
            "; BERT and Gemma disagree" if disagrees else
            "; Gemma confidence is below its acceptance threshold" if low_llm_confidence else
            "; Gemma confirmed the category"
        ),
    })
