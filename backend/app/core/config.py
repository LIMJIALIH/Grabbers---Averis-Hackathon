from pathlib import Path

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


settings = Settings()
