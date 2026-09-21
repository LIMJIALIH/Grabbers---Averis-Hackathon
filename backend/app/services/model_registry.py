"""Shared lazy service instances used by API routes."""

from functools import lru_cache

from app.core.config import settings
from app.services.email_classifier import EmailClassifier


@lru_cache(maxsize=1)
def get_email_classifier() -> EmailClassifier:
    return EmailClassifier(settings.model_dir, settings.model_device)
