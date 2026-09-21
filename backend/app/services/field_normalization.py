"""Conservative normalization after model extraction, before comparison."""

import re
from decimal import Decimal

from app.schemas.extraction import NormalizedFields, RawFields

NUMBER = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"


def normalize_fields(raw: RawFields) -> tuple[NormalizedFields, list[str]]:
    normalized = NormalizedFields()
    issues = []
    for key, value in raw.model_dump().items():
        if value is None or not value.strip():
            continue
        value = " ".join(value.split())
        if key == "container_count":
            match = re.fullmatch(r"(\d{1,3}(?:,\d{3})+|\d+)(?:\s+containers?)?", value, re.I)
            if match:
                normalized.container_count = int(match[1].replace(",", ""))
            else:
                issues.append("container_count: ambiguous or invalid count")
        elif key == "gross_weight_kg":
            match = re.fullmatch(
                rf"({NUMBER})\s*(kg|kgs|kilograms?|t|tonnes?|metric\s*tons?|mt)", value, re.I,
            )
            if match:
                number = Decimal(match[1].replace(",", ""))
                unit = match[2].lower()
                normalized.gross_weight_kg = number if unit.startswith("k") else number * 1000
            else:
                issues.append("gross_weight_kg: ambiguous number, missing unit, or unsupported unit")
        else:
            setattr(normalized, key, value.strip(" ;,.-") or None)
    return normalized, issues
