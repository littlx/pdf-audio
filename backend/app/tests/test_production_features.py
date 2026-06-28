import base64
import hashlib
import hmac
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.tasks import delete_task, retry_task
from app.core.config import settings, validate_runtime_settings
from app.core.security import generate_session_token, validate_url_ssrf, verify_raw_access_token, verify_session_token
from app.db.models import AudioFile, ConversionTask
from app.db.session import Base
from app.main import app
from app.services.cleanup_service import cleanup_expired_records


# Ensure main app import can be tested.
def test_import_main():
    import app.main

    assert app.main.app is not None


def test_cookie_secure_default_logic(monkeypatch):
    # Test production default.
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "cookie_secure", None)
    assert settings.is_cookie_secure is True

    # Test development default.
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "cookie_secure", None)
    assert settings.is_cookie_secure is False

    # Test explicit override.
    monkeypatch.setattr(settings, "cookie_secure", False)
    assert settings.is_cookie_secure is False

    monkeypatch.setattr(settings, "cookie_secure", True)
    assert settings.is_cookie_secure is True


def test_raw_access_token_verification(monkeypatch):
    monkeypatch.setattr(settings, "app_access_token", "raw-passcode")

    assert verify_raw_access_token("raw-passcode") is True
    assert verify_raw_access_token("wrong-passcode") is False
    assert verify_raw_access_token("") is False
    assert verify_raw_access_token(None) is False

    monkeypatch.setattr(settings, "app_access_token", "")
    assert verify_raw_access_token("raw-passcode") is False


def test_session_token_verification(monkeypatch):
    monkeypatch.setattr(settings, "app_access_token", "my-super-secret-token")

    # 1. Test raw token matching.
    assert verify_session_token("my-super-secret-token") is True

    # 2. Test signed session token.
    token = generate_session_token()
    assert verify_session_token(token) is True

    # 3. Test tampered token.
    tampered = base64.b64encode(b"12345:badsignature").decode("utf-8")
    assert verify_session_token(tampered) is False

    # 4. Test expired token.
    old_timestamp = str(int(time.time() - 8 * 24 * 3600))
    msg = old_timestamp.encode("utf-8")
    key = settings.app_access_token.encode("utf-8")
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    expired_token = base64.b64encode(f"{old_timestamp}:{sig}".encode("utf-8")).decode("utf-8")

    assert verify_session_token(expired_token) is False


def test_ssrf_url_validation(monkeypatch):
    # In development mode, SSRF validation should allow localhost/private IPs.
    monkeypatch.setattr(settings, "app_env", "development")
    validate_url_ssrf("http://localhost:8543")
    validate_url_ssrf("http://127.0.0.1:11434")
    validate_url_ssrf("http://192.168.1.50")
    validate_url_ssrf("http://[::1]:8543")

    # In production mode, SSRF validation must block localhost/private IPs.
    monkeypatch.setattr(settings, "app_env", "production")
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_url_ssrf("http://localhost:8543")
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_url_ssrf("http://127.0.0.1")
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_url_ssrf("http://192.168.1.1")
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_url_ssrf("http://169.254.169.254")
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_url_ssrf("http://[::1]:8543")

    # Safe domain should pass in both modes.
    validate_url_ssrf("https://api.deepseek.com")


def test_login_interface_and_rate_limiting(monkeypatch):
    monkeypatch.setattr(settings, "app_access_token", "test-passcode")

    # Import FAILED_ATTEMPTS from auth to clear it for the test.
    from app.api.auth import FAILED_ATTEMPTS

    FAILED_ATTEMPTS.clear()
    client = TestClient(app)

    # 1. Test successful login.
    response = client.post("/api/auth/login", json={"token": "test-passcode"})
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert "token" in response.json()
    assert verify_session_token(response.json()["token"]) is True

    # 2. Test failed login.
    response = client.post("/api/auth/login", json={"token": "wrong-passcode"})
    assert response.status_code == 401

    # 3. Test rate limiting (5 failures lead to 429).
    for _ in range(4):
        response = client.post("/api/auth/login", json={"token": "wrong-passcode"})
        assert response.status_code == 401

    response = client.post("/api/auth/login", json={"token": "wrong-passcode"})
    assert response.status_code == 429
    assert "Too many failed login attempts" in response.json()["detail"]

    FAILED_ATTEMPTS.clear()


def test_api_auth_requires_valid_session_token(monkeypatch):
    monkeypatch.setattr(settings, "app_access_token", "api-passcode")
    from app.api.auth import FAILED_ATTEMPTS

    FAILED_ATTEMPTS.clear()
    client = TestClient(app)

    unauthenticated = client.get("/api/pdfs")
    assert unauthenticated.status_code == 401

    tampered = client.get("/api/pdfs", headers={"X-Access-Token": "not-a-valid-session"})
    assert tampered.status_code == 401

    login = client.post("/api/auth/login", json={"token": "api-passcode"})
    assert login.status_code == 200
    session_token = login.json()["token"]

    authenticated = client.get("/api/pdfs", headers={"X-Access-Token": session_token})
    assert authenticated.status_code == 200

    # Cookie auth must also work because SSE and media requests rely on browser cookies.
    cookie_authenticated = client.get("/api/pdfs")
    assert cookie_authenticated.status_code == 200

    FAILED_ATTEMPTS.clear()


def test_delete_running_task_409(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # 1. Create a task that is actively running (not stale).
        active_task = ConversionTask(
            id="task_active",
            input_type="page_range",
            status="running",
            stage="extracting_text",
            heartbeat_at=datetime.now(timezone.utc),
        )
        db.add(active_task)
        db.commit()

        with pytest.raises(HTTPException) as exc:
            delete_task("task_active", db)
        assert exc.value.status_code == 409
        assert "Cannot delete an actively running task" in exc.value.detail

        # 2. Create a stale task.
        stale_task = ConversionTask(
            id="task_stale",
            input_type="page_range",
            status="running",
            stage="extracting_text",
            heartbeat_at=datetime.now(timezone.utc) - timedelta(seconds=9999),
        )
        db.add(stale_task)
        db.commit()

        res = delete_task("task_stale", db)
        assert res["ok"] is True
        assert db.get(ConversionTask, "task_stale") is None

    finally:
        db.close()


def test_canceled_task_retry(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    # Mock active_task_admission_lock and enqueue_task to avoid Redis dependencies.
    @contextmanager
    def mock_lock():
        yield

    monkeypatch.setattr("app.api.tasks.active_task_admission_lock", mock_lock)
    monkeypatch.setattr("app.api.tasks.enqueue_task", lambda task_id: None)
    monkeypatch.setattr("app.api.tasks.ensure_active_capacity", lambda db: None)

    try:
        canceled_task = ConversionTask(
            id="task_canceled",
            input_type="page_range",
            status="canceled",
            stage="canceled",
        )
        db.add(canceled_task)
        db.commit()

        retried = retry_task("task_canceled", db)
        assert retried.status == "pending"

    finally:
        db.close()


def test_validate_runtime_settings_production_guards(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "worker_mode", "fork")
    monkeypatch.setattr(settings, "max_active_tasks", 1)
    monkeypatch.setattr(settings, "running_task_stale_seconds", 60)
    monkeypatch.setattr(settings, "worker_fallback_to_thread", False)
    monkeypatch.setattr(settings, "redis_url", "redis://localhost:6379/0")
    monkeypatch.setattr(settings, "cors_origins", "https://example.com")

    monkeypatch.setattr(settings, "app_access_token", "change-me")
    with pytest.raises(RuntimeError, match="APP_ACCESS_TOKEN"):
        validate_runtime_settings()

    monkeypatch.setattr(settings, "app_access_token", "strong-passcode")
    monkeypatch.setattr(settings, "cors_origins", "*")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_runtime_settings()

    monkeypatch.setattr(settings, "cors_origins", "https://example.com")
    validate_runtime_settings()


def test_retention_policy_behavior(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # Create dummy old audio file directory and DB records.
        audio_dir = tmp_path / "audios" / "audio_old"
        audio_dir.mkdir(parents=True, exist_ok=True)
        (audio_dir / "file.mp3").write_bytes(b"content")

        old_date = datetime.now(timezone.utc) - timedelta(days=20)
        audio = AudioFile(
            id="audio_old",
            title="Old Audio",
            audio_mode="bilingual",
            audio_path=str(audio_dir / "file.mp3"),
            created_at=old_date,
        )
        db.add(audio)
        db.commit()

        # 1. With retention disabled (None or 0), old audio files must NOT be deleted.
        monkeypatch.setattr(settings, "audio_retention_days", 0)
        retention_days = settings.audio_retention_days
        if retention_days and retention_days > 0:
            cleanup_expired_records(db, max_age_days=retention_days)

        assert db.get(AudioFile, "audio_old") is not None
        assert (audio_dir / "file.mp3").exists()

        # 2. With retention enabled (e.g. 14 days), old audio files must be deleted.
        monkeypatch.setattr(settings, "audio_retention_days", 14)
        retention_days = settings.audio_retention_days
        if retention_days and retention_days > 0:
            cleanup_expired_records(db, max_age_days=retention_days)

        assert db.get(AudioFile, "audio_old") is None
        assert not (audio_dir / "file.mp3").exists()

    finally:
        db.close()


@pytest.mark.anyio
async def test_concurrency_limit_fallback():
    from app.workers.tasks import concurrency_limit
    # Test that concurrency_limit context manager yields and executes even if Redis is down/unset
    async with concurrency_limit("test_limit", 2):
        assert True

