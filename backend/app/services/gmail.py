"""Decode inline MIME bodies only; never fetch attachment data."""
import base64
import binascii
from email.message import Message
from email.utils import formataddr, getaddresses
from html.parser import HTMLParser


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "head"}:
            self.hidden += 1
        if tag in {"br", "p", "div", "li", "tr"} and not self.hidden:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "head"}:
            self.hidden = max(0, self.hidden - 1)
        if tag in {"p", "div", "li", "tr"} and not self.hidden:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def decode_message(message):
    attachments = []

    def body(part, depth=0):
        if depth > 30:
            return ""
        headers = {h["name"].lower(): h["value"] for h in part.get("headers", [])}
        if part.get("filename") or headers.get("content-disposition", "").lower().startswith("attachment"):
            attachments.append(part.get("filename") or "Unnamed attachment")
            return ""
        mime = part.get("mimeType", "").lower()
        children = part.get("parts", [])
        if children:
            decoded = [(child.get("mimeType", ""), body(child, depth + 1)) for child in children]
            if mime == "multipart/alternative":
                return next((text for kind, text in decoded if kind == "text/plain" and text.strip()), next((text for _, text in reversed(decoded) if text.strip()), ""))
            return "\n".join(text for _, text in decoded if text)
        if mime not in {"text/plain", "text/html"}:
            return ""
        data = part.get("body", {}).get("data", "")
        if not data:  # Includes bodies referenced by attachmentId: do not download.
            return ""
        try:
            raw = base64.b64decode(data + "=" * (-len(data) % 4), altchars=b"-_", validate=True)
        except (ValueError, binascii.Error):
            return "[Message body could not be decoded]"
        content_type = Message()
        content_type["content-type"] = headers.get("content-type", mime)
        try:
            text = raw.decode(content_type.get_content_charset() or "utf-8", errors="replace")
        except LookupError:
            text = raw.decode("utf-8", errors="replace")
        if mime == "text/html":
            parser = PlainHTML()
            parser.feed(text)
            text = "".join(parser.parts)
        return text.strip()

    payload = message.get("payload", {})
    headers = {}
    for item in payload.get("headers", []):
        headers.setdefault(item["name"].lower(), []).append(item["value"])

    def header(name, default=""):
        return headers.get(name, [default])[0]

    def addresses(name):
        return [formataddr(address) for address in getaddresses(headers.get(name, [])) if address != ("", "")]

    text = body(payload)
    return {
        "id": message["id"],
        "thread_id": message.get("threadId", ""),
        "sender": header("from", "Unknown sender"),
        "to": addresses("to"),
        "cc": addresses("cc"),
        "subject": header("subject", "(No subject)"),
        "snippet": message.get("snippet", ""),
        "timestamp": int(message.get("internalDate", 0)),
        "labels": message.get("labelIds", []),
        "body": text,
        "attachments": attachments,
    }
