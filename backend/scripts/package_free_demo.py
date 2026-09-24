"""Encrypt the authorized demo mailbox and cached BERT decisions for Render Free."""

import argparse
import base64
import io
import json
import os
import tarfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.bootstrap_demo import MAGIC
from app.core.config import BACKEND_DIR, settings
from app.services.email_classifier import EmailClassifier
from app.services.hosted_classifier import email_fingerprint


def add_bytes(archive: tarfile.TarFile, name: str, content: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(content)
    info.mode = 0o600
    archive.addfile(info, io.BytesIO(content))


def package(predictions_path: Path | None = None) -> Path:
    key_text = os.environ.get("DOCUVERIFY_DEMO_ARCHIVE_KEY", "")
    if not key_text:
        raise RuntimeError("Set DOCUVERIFY_DEMO_ARCHIVE_KEY before packaging")
    key = base64.urlsafe_b64decode(key_text + "=" * (-len(key_text) % 4))
    if len(key) != 32:
        raise RuntimeError("DOCUVERIFY_DEMO_ARCHIVE_KEY must encode 32 bytes")
    bundle = settings.bundle_dir
    inbox = sorted((bundle / "inbox").glob("*.json"))
    if not inbox or not (bundle / "attachments").is_dir():
        raise RuntimeError("The local demo bundle is incomplete")
    saved = json.loads(predictions_path.read_text(encoding="utf-8")) if predictions_path else {}
    classifier = None if predictions_path else EmailClassifier(settings.model_dir, "cpu")
    cache = {}
    for path in inbox:
        item = json.loads(path.read_text(encoding="utf-8"))
        subject, body = item.get("subject", ""), item.get("body", "")
        if subject.strip() or body.strip():
            prediction = saved[item["email_id"]] if predictions_path else classifier.predict(subject, body).model_dump()
            cache[email_fingerprint(subject, body)] = prediction

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        add_bytes(archive, "classifications.json", json.dumps(cache, separators=(",", ":")).encode())
        for folder in ("inbox", "attachments"):
            for path in sorted((bundle / folder).rglob("*")):
                if path.is_symlink():
                    raise RuntimeError("Bundle must not contain symlinks")
                if path.is_file():
                    name = f"resources/sdoc-hackathon-bundle/{folder}/{path.relative_to(bundle / folder).as_posix()}"
                    add_bytes(archive, name, path.read_bytes())
    nonce = os.urandom(12)
    ciphertext = MAGIC + nonce + AESGCM(key).encrypt(nonce, buffer.getvalue(), MAGIC)
    output = BACKEND_DIR / "deployment" / "demo-bundle.enc"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(ciphertext)
    print(f"Packaged {len(inbox)} inbox records and {len(cache)} classifications into {output.name}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", type=Path, help="Optional precomputed BERT output keyed by email_id")
    package(parser.parse_args().predictions)
