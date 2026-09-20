"""Schemas shared by the extraction-verification orchestration layer."""

from typing import Literal

from pydantic import BaseModel, Field


FieldSide = Literal["si", "bl"]
ExtractionStatus = Literal["ok", "ocr_needed", "failed", "missing"]
Route = Literal["skip", "ocr_recovery", "single_side", "dual_side", "hitl"]
Verdict = Literal["verified", "incorrect", "mislabeled", "not_found", "ambiguous", "unreadable"]
Decision = Literal[
    "pending_verification", "approved", "auto_corrected", "mislabeled", "missing",
    "unreadable", "ambiguous", "document_mismatch", "needs_review",
]


class CandidateValue(BaseModel):
    side: FieldSide
    raw: str = ""
    normalized: str = ""
    normalization_rules: list[str] = Field(default_factory=list)
    extraction_status: ExtractionStatus = "ok"


class VerificationRoute(BaseModel):
    key: str
    label: str
    route: Route
    applicable_sides: list[FieldSide] = Field(default_factory=list)
    reason: str
    requires_source_image: bool = False


class Evidence(BaseModel):
    text: str = ""
    location: str | None = None
    page: int | None = Field(default=None, ge=1)
    source: Literal["text", "image"] | None = None
    label_seen: str | None = None
    value_seen: str | None = None


class VerifierVerdict(BaseModel):
    model: str = ""
    key: str
    side: FieldSide
    status: Verdict
    corrected_raw: str | None = None
    corrected_normalized: str | None = None
    evidence: Evidence


class VerifierResponse(BaseModel):
    """Strict, provider-neutral response returned by one batched model call."""
    verdicts: list[VerifierVerdict]


class HumanResolution(BaseModel):
    """Person confirmed or corrected a field that models could not close."""

    action: Literal["confirm", "correct", "missing", "unreadable"]
    note: str
    si_value: str | None = None
    bl_value: str | None = None
    resolved_at: str


class FieldAudit(BaseModel):
    key: str
    label: str
    candidates: list[CandidateValue]
    route: VerificationRoute
    verifier_a: list[VerifierVerdict] = Field(default_factory=list)
    verifier_b: list[VerifierVerdict] = Field(default_factory=list)
    adjudicator: list[VerifierVerdict] = Field(default_factory=list)
    decision: Decision = "pending_verification"
    final_value: str | None = None
    suggested_resolution: str | None = None
    requires_human_review: bool = False
    human_resolution: HumanResolution | None = None
