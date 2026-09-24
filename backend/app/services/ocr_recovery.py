"""PDF OCR recovery with persisted page images and field-level confidence."""

import re
from contextlib import closing
from pathlib import Path

from app.services.document_fields import FIELD_ALIASES


def recover_pdf(path: Path, image_dir: Path) -> dict:
    """Render a PDF, OCR every page, and retain evidence needed by verifiers."""
    import pypdfium2 as pdfium
    import pytesseract
    from PIL import Image

    image_dir.mkdir(parents=True, exist_ok=True)
    pages, text_parts, field_scores = [], [], {key: [] for key in FIELD_ALIASES}
    with pdfium.PdfDocument(path) as pdf:
        for index in range(len(pdf)):
            with closing(pdf[index]) as page, closing(page.render(scale=min(3, 4000 / max(page.get_size())))) as bitmap:
                with bitmap.to_pil() as source:
                    image = source.convert("RGB")
                    image_path = image_dir / f"page_{index + 1}.png"
                    image.save(image_path, "PNG")
                    data = pytesseract.image_to_data(image, lang="eng", config="--psm 6", output_type=pytesseract.Output.DICT)
                    words = [(word, float(confidence)) for word, confidence in zip(data["text"], data["conf"])
                             if word.strip() and confidence not in {"-1", -1}]
                    confidences = [confidence for _, confidence in words]
                    lines = _lines(data)
                    for key, aliases in FIELD_ALIASES.items():
                        matches = [confidence for line, confidence in lines if any(_contains_alias(line, alias) for alias in aliases)]
                        field_scores[key].extend(matches)
                    page_text = pytesseract.image_to_string(image, lang="eng", config="--psm 6").strip()
                    text_parts.append(page_text)
                    pages.append({"page": index + 1, "image": str(image_path.resolve()),
                                  "mean_confidence": round(sum(confidences) / len(confidences), 2) if confidences else 0.0})
    mean = sum(page["mean_confidence"] for page in pages) / len(pages) if pages else 0.0
    return {"method": "ocr", "text": "\n\n".join(part for part in text_parts if part), "pages": pages,
            "mean_confidence": round(mean, 2),
            "field_confidence": {key: round(sum(scores) / len(scores), 2) if scores else round(mean, 2)
                                 for key, scores in field_scores.items()}}


def _lines(data: dict) -> list[tuple[str, float]]:
    groups: dict[tuple[int, int, int], list[tuple[str, float]]] = {}
    for index, word in enumerate(data["text"]):
        if not word.strip() or data["conf"][index] in {"-1", -1}:
            continue
        group = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        groups.setdefault(group, []).append((word, float(data["conf"][index])))
    return [(" ".join(word for word, _ in words), sum(confidence for _, confidence in words) / len(words)) for words in groups.values()]


def _contains_alias(line: str, alias: str) -> bool:
    return re.sub(r"\W+", "", alias).casefold() in re.sub(r"\W+", "", line).casefold()
