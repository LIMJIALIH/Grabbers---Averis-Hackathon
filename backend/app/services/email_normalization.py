"""Normalize supported email uploads before they enter the classifier contract."""

import json
import re
from email import policy
from email.parser import BytesParser
from pathlib import Path

from pydantic import ValidationError

from app.schemas.verification_upload import EmailUploadMetadata
from app.services.gemma_email import GemmaEmailError, GemmaEmailGateway


class EmailNormalizationError(ValueError):
    """Raised when neither deterministic parsing nor Gemma can normalize an email."""


def _decode_text(content: bytes) -> str:
    encoding = "utf-16" if content.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    return content.decode(encoding)


def _from_message(content: bytes, fallback_id: str) -> EmailUploadMetadata:
    message = BytesParser(policy=policy.default).parsebytes(content)
    body = message.get_body(preferencelist=("plain",)) if message.is_multipart() else None
    text = body.get_content() if body is not None else message.get_payload(decode=True)
    if isinstance(text, bytes):
        text = text.decode(message.get_content_charset() or "utf-8", errors="replace")
    if not isinstance(text, str):
        text = str(message.get_content()) if not message.is_multipart() else ""
    attachments = [part.get_filename() for part in message.iter_attachments() if part.get_filename()]
    return EmailUploadMetadata(
        email_id=(message.get("Message-ID") or fallback_id).strip(" <>"),
        sender=str(message.get("From") or ""),
        subject=str(message.get("Subject") or ""),
        body=text.strip(),
        attachments=attachments,
    )


def normalize_email_upload(
    path: Path,
    content: bytes,
    gemma: GemmaEmailGateway,
) -> tuple[EmailUploadMetadata, str]:
    """Return the stable BERT input contract and the parser that produced it."""
    suffix = path.suffix.lower()
    fallback_id = path.stem or "uploaded-email"
    deterministic_error: Exception | None = None
    try:
        if suffix == ".json":
            return EmailUploadMetadata.model_validate_json(_decode_text(content)), "json"
        if suffix == ".eml":
            parsed = _from_message(content, fallback_id)
            if not parsed.subject.strip() and not parsed.body.strip():
                raise ValueError("EML has no subject or readable body")
            return parsed, "eml"
        if suffix == ".txt":
            text = _decode_text(content).strip()
            if not text:
                raise ValueError("Text email is empty")
            # RFC-like text emails get real header parsing; free-form text remains a valid BERT body.
            if re.search(r"(?mi)^(subject|from|to|date):\s*\S", text[:8000]):
                parsed = _from_message(content, fallback_id)
                if parsed.subject.strip() or parsed.body.strip():
                    return parsed, "text"
            return EmailUploadMetadata(email_id=fallback_id, body=text), "text"
        deterministic_error = ValueError(f"No deterministic email parser for {suffix or 'this format'}")
    except (UnicodeError, ValueError, ValidationError, json.JSONDecodeError) as exc:
        deterministic_error = exc

    if not gemma.available:
        raise EmailNormalizationError(
            f"Could not parse {path.name} deterministically ({deterministic_error}); "
            "configure DOCUVERIFY_GEMMA_API_KEY to normalize this format"
        ) from deterministic_error
    try:
        return gemma.normalize(path, fallback_id), "gemma"
    except GemmaEmailError as exc:
        raise EmailNormalizationError(
            f"Could not normalize {path.name}: deterministic parser failed ({deterministic_error}); {exc}"
        ) from exc
