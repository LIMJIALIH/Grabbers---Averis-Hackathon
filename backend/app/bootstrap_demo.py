"""Restore the encrypted demo mailbox on an ephemeral Render instance."""

import base64
import io
import os
import tarfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import BACKEND_DIR, settings

MAGIC = b"DVDEMO1\0"
ARCHIVE = BACKEND_DIR / "deployment" / "demo-bundle.enc"
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_BYTES = 20 * 1024 * 1024


def restore() -> None:
    if settings.classification_mode != "hosted":
        return
    if settings.demo_archive_key is None:
        raise RuntimeError("DOCUVERIFY_DEMO_ARCHIVE_KEY is required for hosted mode")
    key_text = settings.demo_archive_key.get_secret_value()
    key = base64.urlsafe_b64decode(key_text + "=" * (-len(key_text) % 4))
    if len(key) != 32:
        raise RuntimeError("DOCUVERIFY_DEMO_ARCHIVE_KEY must encode 32 bytes")
    encrypted = ARCHIVE.read_bytes()
    if not encrypted.startswith(MAGIC):
        raise RuntimeError("Demo archive format is invalid")
    nonce = encrypted[len(MAGIC):len(MAGIC) + 12]
    plaintext = AESGCM(key).decrypt(nonce, encrypted[len(MAGIC) + 12:], MAGIC)

    root = settings.bundle_dir.parent.parent.resolve()
    if settings.classification_cache_path.resolve() != root / "classifications.json":
        raise RuntimeError("Classification cache path must be inside the demo root")
    total = 0
    with tarfile.open(fileobj=io.BytesIO(plaintext), mode="r:gz") as archive:
        members = archive.getmembers()
        if len(members) > 2000:
            raise RuntimeError("Demo archive contains too many files")
        for member in members:
            name = Path(member.name)
            allowed = (
                member.name == "classifications.json"
                or name.parts[:2] == ("resources", "sdoc-hackathon-bundle")
                and name.parts[2:3] in {("inbox",), ("attachments",)}
            )
            target = (root / name).resolve()
            if not allowed or not target.is_relative_to(root) or not member.isfile():
                raise RuntimeError("Demo archive contains an unsafe path or entry")
            if member.size > MAX_FILE_BYTES:
                raise RuntimeError("Demo archive file exceeds the size limit")
            total += member.size
            if total > MAX_TOTAL_BYTES:
                raise RuntimeError("Demo archive exceeds the size limit")
        for member in members:
            target = root / member.name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with archive.extractfile(member) as source, target.open("wb") as output:
                if source is None:
                    raise RuntimeError("Demo archive entry is unreadable")
                output.write(source.read())
            os.chmod(target, 0o600)


if __name__ == "__main__":
    restore()
