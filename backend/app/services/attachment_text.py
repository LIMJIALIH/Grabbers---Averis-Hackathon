from __future__ import annotations

import base64
import re
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

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


def _pdf_unescape(value: bytes) -> str:
    result = bytearray()
    index = 0
    while index < len(value):
        if value[index:index + 1] != b"\\":
            result.extend(value[index:index + 1])
            index += 1
            continue
        index += 1
        if index >= len(value):
            break
        escaped = value[index:index + 1]
        index += 1
        if escaped == b"n":
            result.extend(b"\n")
        elif escaped == b"r":
            result.extend(b"\r")
        elif escaped == b"t":
            result.extend(b"\t")
        elif escaped == b"b":
            result.extend(b"\b")
        elif escaped == b"f":
            result.extend(b"\f")
        elif escaped in {b"(", b")", b"\\"}:
            result.extend(escaped)
        elif escaped[:1].isdigit():
            octal = escaped
            while index < len(value) and len(octal) < 3 and value[index:index + 1].isdigit():
                octal += value[index:index + 1]
                index += 1
            result.append(int(octal, 8))
        else:
            result.extend(escaped)
    return result.decode("latin-1", errors="replace")


def _decode_pdf_stream(raw: bytes) -> bytes:
    candidates = [raw.strip()]
    for candidate in list(candidates):
        for adobe in (True, False):
            try:
                ascii85 = base64.a85decode(candidate, adobe=adobe)
            except Exception:
                continue
            candidates.append(ascii85)
    for candidate in candidates:
        try:
            return zlib.decompress(candidate)
        except Exception:
            continue
    return raw


def _read_pdf(path: Path) -> str:
    data = path.read_bytes()
    chunks: list[str] = []
    marker = 0
    while True:
        start = data.find(b"stream", marker)
        if start == -1:
            break
        start += len(b"stream")
        while start < len(data) and data[start:start + 1] in {b"\r", b"\n", b" "}:
            start += 1
        end = data.find(b"endstream", start)
        if end == -1:
            break
        payload = _decode_pdf_stream(data[start:end].strip())
        for match in re.finditer(rb"\((?:\\.|[^\\])*?\)\s*Tj", payload):
            literal = match.group(0)
            chunks.append(_pdf_unescape(literal[1:literal.rfind(b")")]))
        for match in re.finditer(rb"\[(.*?)\]\s*TJ", payload, re.S):
            for literal in re.findall(rb"\((?:\\.|[^\\])*?\)", match.group(1)):
                chunks.append(_pdf_unescape(literal[1:-1]))
        marker = end + len(b"endstream")
    return _clean_chunks(chunks)


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