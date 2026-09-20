"""HITL queue items: source evidence, reason, and the human decision contract."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.llm_verification import (
    CandidateValue, Decision, Evidence, FieldSide, HumanResolution, VerifierVerdict,
)

ReviewAction = Literal["confirm", "correct", "missing", "unreadable"]


class ReviewItem(BaseModel):
    email_id: str
    key: str
    label: str
    decision: Decision
    reason: str
    candidates: list[CandidateValue] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    verifier_a: list[VerifierVerdict] = Field(default_factory=list)
    verifier_b: list[VerifierVerdict] = Field(default_factory=list)
    adjudicator: list[VerifierVerdict] = Field(default_factory=list)


class HumanDecision(BaseModel):
    email_id: str
    key: str
    action: ReviewAction
    note: str
    si_value: str | None = None
    bl_value: str | None = None
    side: FieldSide | None = None


class ReportField(BaseModel):
    key: str
    label: str
    si_value: str
    bl_value: str
    result: Literal["matched", "mismatch", "unresolved"]
    note: str | None = None


class ComparisonReport(BaseModel):
    email_id: str
    generated_at: str
    status: Literal["ok", "mismatch", "needs_review"]
    matched: int = 0
    mismatched: int = 0
    unresolved: int = 0
    fields: list[ReportField] = Field(default_factory=list)
    unresolved_items: list[ReviewItem] = Field(default_factory=list)
    human_resolutions: int = 0
