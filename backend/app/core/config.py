from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DOCUVERIFY_",
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
    )

    cors_origins: list[str] = ["http://localhost:3000"]
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
