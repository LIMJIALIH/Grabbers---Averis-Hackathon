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

    cors_origins: list[str] = ["http://localhost:3000"]
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
    inbox_base_url: str = "http://localhost:8080"
    model_dir: Path = BACKEND_DIR / "model" / "email_multiclass_classifier"
    model_device: str = "auto"
    gemini_api_key: SecretStr | None = None
    extraction_primary_model: str = "gemini-3.8-flash"
    extraction_secondary_model: str = "gemini-3.7-flash"
    extraction_timeout_seconds: float = Field(default=60, gt=0)
    extraction_max_retries: int = Field(default=1, ge=0)
    extraction_max_input_chars: int = Field(default=100000, gt=0)


settings = Settings()
