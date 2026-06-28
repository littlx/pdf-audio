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
    cors_origins: str = Field(default="http://localhost:8543,http://localhost:5173", alias="CORS_ORIGINS")
    worker_fallback_to_thread: bool = Field(default=True, alias="WORKER_FALLBACK_TO_THREAD")
    worker_mode: str = Field(default="simple", alias="WORKER_MODE")
    max_active_tasks: int = Field(default=5, alias="MAX_ACTIVE_TASKS")
    running_task_stale_seconds: int = Field(default=7200, alias="RUNNING_TASK_STALE_SECONDS")
    ai_api_key: str | None = Field(default=None, alias="AI_API_KEY")
    settings_encryption_key: str | None = Field(default=None, alias="SETTINGS_ENCRYPTION_KEY")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    tts_proxy: str | None = Field(default=None, alias="TTS_PROXY")

    model_config = SettingsConfigDict(env_file=(PROJECT_ROOT / ".env", BACKEND_ROOT / ".env"), extra="ignore")


settings = Settings()


def _is_production_like() -> bool:
    return settings.app_env.lower() not in {"development", "dev", "local", "test"}


def validate_runtime_settings() -> None:
    app_env = settings.app_env.lower()
    token = (settings.app_access_token or "").strip()
    worker_mode = settings.worker_mode.lower()
    origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]

    if worker_mode not in {"simple", "fork"}:
        raise RuntimeError("WORKER_MODE must be either 'simple' or 'fork'")
    if settings.max_active_tasks < 1:
        raise RuntimeError("MAX_ACTIVE_TASKS must be at least 1")
    if settings.running_task_stale_seconds < 60:
        raise RuntimeError("RUNNING_TASK_STALE_SECONDS must be at least 60")
    if not token:
        raise RuntimeError("APP_ACCESS_TOKEN must be set")

    if _is_production_like():
        if token == "change-me" or token == "replace-with-a-long-random-access-code" or len(token) < 6:
            raise RuntimeError("APP_ACCESS_TOKEN must be set to a non-default value of at least 6 characters outside development")
        if settings.worker_fallback_to_thread:
            import logging
            logging.getLogger(__name__).warning("WORKER_FALLBACK_TO_THREAD is enabled outside development; this is not recommended for high load.")
        if not settings.redis_url:
            raise RuntimeError("REDIS_URL must be set outside development")
        if "*" in origins:
            raise RuntimeError("CORS_ORIGINS must be explicit outside development; wildcard '*' is not allowed")
