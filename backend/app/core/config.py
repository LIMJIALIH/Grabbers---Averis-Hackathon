from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DOCUVERIFY_",
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
    )

    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    bundle_dir: Path = BACKEND_DIR / "resources" / "sdoc-hackathon-bundle"
    inbox_base_url: str = "http://localhost:8080"
    model_dir: Path = BACKEND_DIR / "model" / "email_multiclass_classifier"
    model_device: str = "auto"
    gemma_api_key: str | None = None
    gemma_model: str = "gemma-4-26b-a4b-it"
    gemma_timeout_ms: int = 120_000


settings = Settings()
