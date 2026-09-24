from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr, field_validator
from urllib.parse import urlsplit

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DOCUVERIFY_",
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
    )

    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    google_project_id: str = ""
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    app_origin: str = "http://localhost:3000"

    @field_validator("app_origin", mode="before")
    @classmethod
    def validate_origin(cls, value):
        value = (value or "http://localhost:3000").rstrip("/")
        url = urlsplit(value)
        if not url.hostname or url.path or url.query or url.fragment or url.username or url.password:
            raise ValueError("APP_ORIGIN must be an origin without a path")
        if url.scheme != "https" and not (url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}):
            raise ValueError("APP_ORIGIN requires HTTPS outside localhost")
        return value
    bundle_dir: Path = BACKEND_DIR / "resources" / "sdoc-hackathon-bundle"
    inference_dir: Path = BACKEND_DIR / "data_prep" / "inference_data"
    inbox_base_url: str = "http://localhost:8080"
    model_dir: Path = BACKEND_DIR / "model" / "email_multiclass_classifier"
    model_device: str = "auto"
    classification_mode: str = "bert"
    classification_cache_path: Path = BACKEND_DIR / "deployment" / "classifications.json"
    classification_hosted_model: str = "gemini-2.5-flash"
    demo_archive_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None
    extraction_primary_model: str = "gemini-3.8-flash"
    extraction_secondary_model: str = "gemini-3.7-flash"
    extraction_timeout_seconds: float = Field(default=60, gt=0)
    extraction_max_retries: int = Field(default=1, ge=0)
    extraction_max_input_chars: int = Field(default=100000, gt=0)
    gemma_api_key: str | None = None
    gemma_model: str = "gemma-4-26b-a4b-it"
    gemma_timeout_ms: int = 120_000
    classification_min_margin: float = Field(default=0.20, ge=0, le=1)
    classification_llm_min_confidence: float = Field(default=0.70, ge=0, le=1)
    classification_threshold_bl_comparison: float = Field(default=0.85, ge=0, le=1)
    classification_threshold_si_request: float = Field(default=0.90, ge=0, le=1)
    classification_threshold_invoice_query: float = Field(default=0.90, ge=0, le=1)
    classification_threshold_general: float = Field(default=0.75, ge=0, le=1)
    classification_threshold_spam: float = Field(default=0.60, ge=0, le=1)
    openai_api_key: SecretStr | None = None
    openai_verifier_model: str = "gpt-5.4-mini"
    openai_verifier_b_model: str = "gpt-4.1-mini"
    verification_audit_path: Path = BACKEND_DIR / "exports" / "llm_verification_audit.json"


settings = Settings()
