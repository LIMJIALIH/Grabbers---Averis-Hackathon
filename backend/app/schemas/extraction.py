"""Stage 5 raw model output and deterministic normalization results."""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RawFields(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    shipper: str | None
    consignee: str | None
    notify_party: str | None
    port_of_loading: str | None
    port_of_discharge: str | None
    container_count: str | None
    gross_weight_kg: str | None = Field(description="Original weight text WITH its source unit; do not convert")


class NormalizedFields(BaseModel):
    shipper: str | None = None
    consignee: str | None = None
    notify_party: str | None = None
    port_of_loading: str | None = None
    port_of_discharge: str | None = None
    container_count: int | None = Field(default=None, ge=0)
    gross_weight_kg: Decimal | None = Field(default=None, ge=0)


class ModelExtraction(BaseModel):
    model: str
    raw_fields: RawFields | None = None
    normalized_fields: NormalizedFields | None = None
    issues: list[str] = Field(default_factory=list)
    error: str | None = None


class FieldCheck(BaseModel):
    key: str
    status: Literal["agreed", "disagreed", "missing_or_invalid", "model_error"]


class DocumentExtraction(BaseModel):
    filename: str
    document_type: Literal["SI", "BL"]
    attempts: list[ModelExtraction] = Field(default_factory=list)
    field_checks: list[FieldCheck] = Field(default_factory=list)
    normalized_fields: NormalizedFields = Field(default_factory=NormalizedFields)
    issues: list[str] = Field(default_factory=list)
    error: str | None = None
