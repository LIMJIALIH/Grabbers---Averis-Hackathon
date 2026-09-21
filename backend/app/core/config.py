from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    openai_api_key: SecretStr | None = None
    openai_verifier_model: str = "gpt-5.4-mini"
    openai_verifier_b_model: str = "gpt-4.1-mini"
    verification_audit_path: Path = BACKEND_DIR / "exports" / "llm_verification_audit.json"


settings = Settings()
