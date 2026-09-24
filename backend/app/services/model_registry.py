"""Shared lazy service instances used by API routes."""

from functools import lru_cache

from app.core.config import settings
from app.services.email_classifier import EmailClassifier
from app.services.hosted_classifier import HostedEmailClassifier


@lru_cache(maxsize=1)
def get_email_classifier() -> EmailClassifier | HostedEmailClassifier:
    if settings.classification_mode == "hosted":
        return HostedEmailClassifier(
            settings.classification_cache_path,
            settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else None,
            settings.classification_hosted_model,
        )
    return EmailClassifier(settings.model_dir, settings.model_device)
