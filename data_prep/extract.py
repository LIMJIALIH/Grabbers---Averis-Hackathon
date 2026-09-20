"""Attachment -> plain text. Everything in this bundle is digital text; nothing needs OCR."""
import html, re, zipfile
from pathlib import Path


def _docx(p):
    x = zipfile.ZipFile(p).read("word/document.xml").decode("utf-8")
    x = re.sub(r"<w:(br|tab)[^>]*/>", "\n", x)
    x = re.sub(r"</w:(p|tc)>", "\n", x)
    return html.unescape(re.sub(r"<[^>]+>", "", x))


def _xlsx(p):
    import openpyxl

    ws = openpyxl.load_workbook(p, data_only=True).active
    return "\n".join(
        " | ".join("" if c is None else str(c) for c in row).rstrip(" |")
        for row in ws.iter_rows(values_only=True)
    )


def _pdf(p):
    from pypdf import PdfReader

    return "\n".join(pg.extract_text() or "" for pg in PdfReader(p).pages)


def _txt(p):
    return Path(p).read_text(encoding="utf-8", errors="replace")


READERS = {".txt": _txt, ".pdf": _pdf, ".docx": _docx, ".xlsx": _xlsx}


def extract(path):
    """Text, or '' if the file is corrupt / image-only / an unknown type (-> unreadable)."""
    try:
        return READERS[Path(path).suffix.lower()](path).strip()
    except Exception:
        return ""
