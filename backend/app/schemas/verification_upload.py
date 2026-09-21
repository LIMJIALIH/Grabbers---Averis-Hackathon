"""Contracts for JSON-first verification uploads."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.classification import ClassificationResponse
from app.schemas.verification import ComparisonField, VerificationResult


class EmailUploadMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    email_id: str = Field(min_length=1, max_length=200)
    sender: str = Field(default="", alias="from", max_length=500)
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=200_000)
    attachments: list[str] = Field(default_factory=list, max_length=30)


class DashboardAttachment(BaseModel):
    name: str
    url: None = None
    text: str | None = None


class DashboardCase(BaseModel):
    id: str
    vessel: str
    company: str
    time: str
    kind: str
    fields: list[ComparisonField] = Field(default_factory=list)
    body: str
    attachments: list[DashboardAttachment] = Field(default_factory=list)
    state: Literal["review", "approved", "escalated"] = "review"


class VerificationUploadResponse(BaseModel):
    case: DashboardCase
    classification: ClassificationResponse
    verification: VerificationResult | None = None
    gemma_used: bool = False
    warnings: list[str] = Field(default_factory=list)
