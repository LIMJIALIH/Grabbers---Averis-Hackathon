import re
from pathlib import Path

from app.services.attachment_text import extract_attachment_text


FIELD_SPECS = [
    ("shipper", "Shipper"),
    ("consignee", "Consignee"),
    ("notify_party", "Notify Party"),
    ("port_of_loading", "Port of Loading"),
    ("port_of_discharge", "Port of Discharge"),
    ("container_count", "Container Count"),
    ("gross_weight_kg", "Gross Weight (kg)"),
]

FIELD_ALIASES = {
    "shipper": ["Shipper", "Shipper/Exporter"],
    "consignee": ["Consignee", "To the Order of", "To Order", "To Order Of"],
    "notify_party": ["Notify Party", "Notify", "NOTIFY PARTY"],
    "port_of_loading": ["Port of Loading", "Port of Landing", "Load Port", "POL", "P/L"],
    "port_of_discharge": ["Port of Discharge", "Discharge Port", "POD", "P/D"],
    "container_count": ["Container Count", "No. of Containers", "No. of Containers or Packages", "Total Containers"],
    "gross_weight_kg": ["Gross Wt", "Gross Weight", "TOTAL Gross Wt", "TOTAL Gross Weight"],
}

TERMINATOR_LABELS = [
    "Vessel",
    "Ocean Vessel",
    "Export Carrier",
    "Voyage",
    "Voy. No",
    "Voy No",
    "Description",
    "Booking No",
    "B/L No",
    "B/L NUMBER",
    "Freight",
    "HS Code",
    "OC No",
    "Container No",
    "CONTAINER NO.",
    "Marks and Numbers",
]


def _clean_text(value: str) -> str:
    return " ".join(value.replace("\r", "").split()).strip(" ;,.-")


def _clean_party(value: str) -> str:
    return _clean_text(value)


def _clean_port(value: str) -> str:
    return _clean_text(value)


def _clean_container_count(value: str) -> str:
    match = re.search(r"\d+", value.replace(",", ""))
    return match.group(0) if match else ""


def _clean_gross_weight(value: str) -> str:
    match = re.search(r"(\d[\d,]*(?:\.\d+)?)", value)
    if not match:
        return ""
    number_text = match.group(1).replace(",", "")
    number = float(number_text)
    if re.search(r"(?:\bT\b|\bTONNES?\b|\bMETRICTONS?\b|\bMT\b)", value, re.IGNORECASE):
        number *= 1000
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"


NORMALIZERS = {
    "shipper": _clean_party,
    "consignee": _clean_party,
    "notify_party": _clean_party,
    "port_of_loading": _clean_port,
    "port_of_discharge": _clean_port,
    "container_count": _clean_container_count,
    "gross_weight_kg": _clean_gross_weight,
}

ALL_LABELS = sorted(
    {alias for aliases in FIELD_ALIASES.values() for alias in aliases} | set(TERMINATOR_LABELS),
    key=len,
    reverse=True,
)

LABEL_REGEXES = {
    key: re.compile(
        rf"^(?:{'|'.join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))})"
        rf"(?:\s*\([^)]*\))*\s*(?:[:\-]\s*)?(.*)$",
        re.IGNORECASE,
    )
    for key, aliases in FIELD_ALIASES.items()
}

ANY_LABEL_REGEX = re.compile(
    rf"^(?:{'|'.join(re.escape(alias) for alias in ALL_LABELS)})"
    rf"(?:\s*\([^)]*\))*\s*(?:[:\-]\s*)?.*$",
    re.IGNORECASE,
)


def _extract_label_value(text: str, key: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    label_regex = LABEL_REGEXES[key]
    for index, line in enumerate(lines):
        match = label_regex.match(line)
        if not match:
            continue
        remainder = match.group(1).strip(" :-")
        if key == "gross_weight_kg":
            if remainder and re.search(r"\d", remainder):
                return remainder
            for next_line in lines[index + 1 :]:
                next_match = label_regex.match(next_line)
                if not next_match:
                    continue
                next_remainder = next_match.group(1).strip(" :-")
                if next_remainder and re.search(r"\d", next_remainder):
                    return next_remainder
            return ""
        if remainder:
            return remainder
        collected = []
        for next_line in lines[index + 1 :]:
            if ANY_LABEL_REGEX.match(next_line):
                break
            collected.append(next_line)
        return " ".join(collected).strip()
    return ""


def _value_for_key(text: str, key: str) -> str:
    return NORMALIZERS[key](_extract_label_value(text, key))


def _score_values(si: str, bl: str) -> int:
    if not si and not bl:
        return 0
    if si and bl and si.casefold() == bl.casefold():
        return 100
    if si and bl:
        return 70
    return 60


def extract_comparison_fields(attachment_paths: list[str], bundle_dir: Path) -> list[dict[str, object]]:
    texts = {"si": "", "bl": ""}
    for name in attachment_paths:
        suffix = Path(name).stem.upper()
        path = (bundle_dir / name).resolve()
        if not path.is_file():
            continue
        text = extract_attachment_text(path)
        if suffix.endswith("_SI") and not texts["si"]:
            texts["si"] = text
        elif suffix.endswith("_BL") and not texts["bl"]:
            texts["bl"] = text
        elif not texts["si"]:
            texts["si"] = text
        elif not texts["bl"]:
            texts["bl"] = text

    fields = []
    for key, label in FIELD_SPECS:
        si_value = _value_for_key(texts["si"], key) if texts["si"] else ""
        bl_value = _value_for_key(texts["bl"], key) if texts["bl"] else ""
        fields.append(
            {
                "key": key,
                "label": label,
                "si": si_value,
                "bl": bl_value,
                "confidence": _score_values(si_value, bl_value),
            }
        )
    return fields