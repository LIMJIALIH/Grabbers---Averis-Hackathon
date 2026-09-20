from typing import Literal

from pydantic import BaseModel, Field


class AttachmentInput(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    path: str = Field(min_length=1, max_length=1024)
    document_type: Literal["SI", "DL", "BL"] | None = None


class ClassifiedEmail(BaseModel):
    email_id: str = Field(min_length=1)
    tag: Literal["SI", "DL"]
    requires_human_review: bool = False
    attachments: list[AttachmentInput] = Field(max_length=30)


class SourceSegment(BaseModel):
    location: str
    text: str
    page_number: int | None = None
    sheet_name: str | None = None
    ocr_used: bool = False
    error: str | None = None


class IngestedDocument(BaseModel):
    filename: str
    document_type: Literal["SI", "DL", "BL", "UNKNOWN"] = "UNKNOWN"
    status: Literal["ok", "partial", "error"] = "error"
    pages: int | None = None
    text: str = ""
    ocr_used: bool = False
    segments: list[SourceSegment] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None


class IngestionResult(BaseModel):
    email_id: str
    tag: Literal["SI", "DL"]
    status: Literal["ok", "partial", "error", "review_required"]
    requires_human_review: bool
    documents: list[IngestedDocument] = Field(default_factory=list)
