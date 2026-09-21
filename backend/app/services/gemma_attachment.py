"""Hosted Gemma fallback for documents deterministic parsers cannot understand."""

import json
import re
from pathlib import Path
from threading import Lock
from typing import Literal

from pydantic import BaseModel, Field


class GemmaUnavailableError(RuntimeError):
    """Raised when configured Gemma extraction cannot be used."""


class GemmaDocumentExtraction(BaseModel):
    document_type: Literal["SI", "BL", "UNKNOWN"] = "UNKNOWN"
    shipper: str = ""
    consignee: str = ""
    notify_party: str = ""
    port_of_loading: str = ""
    port_of_discharge: str = ""
    container_count: str = ""
    gross_weight_kg: str = ""
    extracted_text: str = ""

    def canonical_text(self) -> str:
        labels = {
            "shipper": "SHIPPER",
            "consignee": "CONSIGNEE",
            "notify_party": "NOTIFY PARTY",
            "port_of_loading": "PORT OF LOADING",
            "port_of_discharge": "PORT OF DISCHARGE",
            "container_count": "CONTAINER COUNT",
            "gross_weight_kg": "GROSS WEIGHT",
        }
        lines = [f"{label}: {getattr(self, key)}" for key, label in labels.items() if getattr(self, key)]
        return "\n".join(lines) or self.extracted_text.strip()


PROMPT = """Extract this shipping document into one JSON object only. Do not use markdown.
The exact keys are: document_type, shipper, consignee, notify_party,
port_of_loading, port_of_discharge, container_count, gross_weight_kg,
extracted_text. document_type must be SI, BL, or UNKNOWN. Use an empty string
when a value is absent. Preserve a compact plain-text transcription in
extracted_text. Never invent missing values."""


def _json_object(text: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.S)
        if not match:
            raise ValueError("Gemma did not return a JSON object")
        return json.loads(match.group(0))


class GemmaAttachmentExtractor:
    def __init__(self, api_key: str | None, model: str):
        self.api_key = api_key
        self.model = model
        self._client = None
        self._lock = Lock()

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _get_client(self):
        if not self.api_key:
            raise GemmaUnavailableError("DOCUVERIFY_GEMMA_API_KEY is not configured")
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise GemmaUnavailableError("google-genai is not installed") from exc
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def extract(self, path: Path, deterministic_text: str = "") -> GemmaDocumentExtraction:
        client = self._get_client()
        uploaded = None
        try:
            with self._lock:
                if deterministic_text.strip():
                    contents = f"{PROMPT}\n\nDOCUMENT TEXT:\n{deterministic_text[:150_000]}"
                else:
                    uploaded = client.files.upload(file=path)
                    contents = [uploaded, PROMPT]
                response = client.models.generate_content(model=self.model, contents=contents)
            if not response.text:
                raise GemmaUnavailableError("Gemma returned no text")
            result = GemmaDocumentExtraction.model_validate(_json_object(response.text))
            if not result.canonical_text():
                raise GemmaUnavailableError("Gemma returned no usable document text or fields")
            return result
        except GemmaUnavailableError:
            raise
        except Exception as exc:
            raise GemmaUnavailableError(f"Gemma extraction failed: {exc}") from exc
        finally:
            if uploaded is not None:
                try:
                    client.files.delete(name=uploaded.name)
                except Exception:
                    pass
