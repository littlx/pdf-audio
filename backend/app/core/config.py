from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_env: str = Field(default="development", alias="APP_ENV")
    app_access_token: str = Field(default="change-me", alias="APP_ACCESS_TOKEN")
    database_url: str = Field(default=f"sqlite:///{PROJECT_ROOT / 'storage' / 'app.db'}", alias="DATABASE_URL")
    storage_dir: str = Field(default=str(PROJECT_ROOT / "storage"), alias="STORAGE_DIR")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    max_pdf_size_mb: int = Field(default=200, alias="MAX_PDF_SIZE_MB")
    max_process_pages: int = Field(default=10, alias="MAX_PROCESS_PAGES")
    cors_origins: str = Field(default="http://localhost:8000,http://localhost:5173", alias="CORS_ORIGINS")
    worker_fallback_to_thread: bool = Field(default=True, alias="WORKER_FALLBACK_TO_THREAD")

    model_config = SettingsConfigDict(env_file=(PROJECT_ROOT / ".env", BACKEND_ROOT / ".env"), extra="ignore")


settings = Settings()


def validate_runtime_settings() -> None:
    if settings.app_env.lower() != "development" and (not settings.app_access_token or settings.app_access_token == "change-me"):
        raise RuntimeError("APP_ACCESS_TOKEN must be set to a non-default value outside development")
