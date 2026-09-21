from __future__ import annotations

import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from contextlib import closing
from threading import Lock

PDF_LOCK = Lock()

NAMESPACE = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}


def _clean_chunks(chunks: list[str]) -> str:
    return "\n".join(chunk.strip() for chunk in chunks if chunk and chunk.strip()).strip()


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _read_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml_bytes = archive.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    paragraphs = []
    for paragraph in root.findall(".//w:p", NAMESPACE):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NAMESPACE))
        if text.strip():
            paragraphs.append(text)
    return _clean_chunks(paragraphs)


def _read_xlsx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for shared_item in shared_root.findall(".//main:si", NAMESPACE):
                shared_strings.append("".join(shared_item.itertext()))

        chunks: list[str] = []
        for sheet_name in sorted(
            name
            for name in archive.namelist()
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        ):
            sheet_root = ET.fromstring(archive.read(sheet_name))
            chunks.append(f"[{Path(sheet_name).stem}]")
            for row in sheet_root.findall(".//main:row", NAMESPACE):
                values: list[str] = []
                for cell in row.findall("main:c", NAMESPACE):
                    value = ""
                    cell_type = cell.attrib.get("t")
                    if cell_type == "s":
                        index_node = cell.find("main:v", NAMESPACE)
                        if index_node is not None and index_node.text is not None:
                            index = int(index_node.text)
                            if 0 <= index < len(shared_strings):
                                value = shared_strings[index]
                    elif cell_type == "inlineStr":
                        inline = cell.find("main:is", NAMESPACE)
                        if inline is not None:
                            value = "".join(inline.itertext())
                    else:
                        value_node = cell.find("main:v", NAMESPACE)
                        if value_node is not None and value_node.text is not None:
                            value = value_node.text
                    if value:
                        values.append(value)
                if values:
                    chunks.append("\t".join(values))
    return _clean_chunks(chunks)


def _read_pdf(path: Path) -> str:
    try:
        import pypdfium2 as pdfium

        with PDF_LOCK, pdfium.PdfDocument(path) as pdf:
            chunks = []
            for index in range(min(len(pdf), 100)):
                with closing(pdf[index]) as page:
                    with closing(page.get_textpage()) as textpage:
                        chunks.append(textpage.get_text_range())
            return _clean_chunks(chunks)
    except Exception:
        # An unreadable preview must not prevent the inbox from loading.
        return ""


def extract_attachment_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return _read_text(path)
    if suffix == ".docx":
        return _read_docx(path)
    if suffix == ".xlsx":
        return _read_xlsx(path)
    if suffix == ".pdf":
        return _read_pdf(path)
    return ""
