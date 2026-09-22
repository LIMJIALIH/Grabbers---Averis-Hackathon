"""Small-runtime classification using cached BERT results and Gemini for new emails."""

import hashlib
import json
from pathlib import Path
from threading import Lock

from app.schemas.classification import ClassificationResponse, EmailCategory
from app.services.email_classifier import ModelUnavailableError
from app.services.gemma_email import GemmaEmailError, GemmaEmailGateway


def email_fingerprint(subject: str, body: str) -> str:
    text = f"{subject.strip()}\n{body.strip()}"
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class HostedEmailClassifier:
    def __init__(self, cache_path: Path, api_key: str | None, model: str):
        self.cache_path = cache_path
        self.gateway = GemmaEmailGateway(api_key, model)
        self._cache: dict[str, dict] | None = None
        self._lock = Lock()

    def _load_cache(self) -> dict[str, dict]:
        if self._cache is None:
            with self._lock:
                if self._cache is None:
                    try:
                        self._cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
                    except (OSError, ValueError) as exc:
                        raise ModelUnavailableError(f"Classification cache unavailable: {exc}") from exc
        return self._cache

    def predict(self, subject: str, body: str) -> ClassificationResponse:
        if not subject.strip() and not body.strip():
            raise ValueError("subject or body must contain text")
        cached = self._load_cache().get(email_fingerprint(subject, body))
        if cached is not None:
            return ClassificationResponse.model_validate(cached).model_copy(update={
                "source": "cached_bert", "device": "cached",
            })
        if not self.gateway.available:
            raise ModelUnavailableError("Gemini classification is not configured")
        try:
            result = self.gateway.classify(subject, body, [])
        except GemmaEmailError as exc:
            raise ModelUnavailableError(f"Hosted classification failed: {exc}") from exc
        categories = EmailCategory.__args__
        remainder = (1 - result.confidence) / (len(categories) - 1)
        scores = {category: result.confidence if category == result.category else remainder
                  for category in categories}
        return ClassificationResponse(
            category=result.category,
            confidence=result.confidence,
            scores=scores,
            device="hosted",
            source="gemini",
        )
