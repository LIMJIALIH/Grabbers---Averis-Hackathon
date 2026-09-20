"""Combined Stage 4 ingestion and Stage 5 extraction response."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ingestion import IngestionResult


class ComparisonField(BaseModel):
    key: str
    label: str
    si: str
    bl: str
    confidence: int = Field(ge=0, le=100)


class VerificationResult(IngestionResult):
    # The inherited status continues to describe ingestion for existing callers.
    extraction_status: Literal["ok", "review_required", "skipped"]
    fields: list[ComparisonField] = Field(default_factory=list)
    review_reasons: list[str] = Field(default_factory=list)
