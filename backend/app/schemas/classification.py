"""Request and response contracts for local email classification."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


EmailCategory = Literal[
    "BL_COMPARISON",
    "SI_REQUEST",
    "INVOICE_QUERY",
    "GENERAL",
    "SPAM",
]


class ClassificationRequest(BaseModel):
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=200_000)

    @model_validator(mode="after")
    def require_text(self):
        if not self.subject.strip() and not self.body.strip():
            raise ValueError("subject or body must contain text")
        return self


class ClassificationResponse(BaseModel):
    category: EmailCategory
    confidence: float = Field(ge=0, le=1)
    scores: dict[EmailCategory, float]
    device: str
    source: Literal["bert", "gemma_fallback", "bert_low_confidence", "cached_bert", "gemini"] = "bert"
    bert_category: EmailCategory | None = None
    bert_confidence: float | None = Field(default=None, ge=0, le=1)
    requires_human_review: bool = False
    fallback_reason: str | None = None
