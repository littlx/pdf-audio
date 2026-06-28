import base64
import json
from urllib.parse import urlparse

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AppSetting

DEFAULT_SETTINGS = {
    "ai_base_url": "https://api.deepseek.com",
    "ai_api_key": "",
    "ai_model": "deepseek-v4-flash",
    "default_bilingual_format": "sentence_pair",
    "default_output_style": "faithful",
    "english_voice": "en-US-JennyNeural",
    "chinese_voice": "zh-CN-XiaoxiaoNeural",
    "english_rate": "+0%",
    "chinese_rate": "+0%",
    "english_volume": "+0%",
    "chinese_volume": "+0%",
    "pause_between_languages_ms": 500,
    "pause_between_segments_ms": 800,
    "subtitle_font_size": "medium",
    "subtitle_color": "default",
    "dark_mode": True,
}

FERNET_PREFIX = "fernet:"
XOR_PREFIX = "xor:"


def _xor_encrypt_val(val: str) -> str:
    if not val:
        return ""
    key = settings.app_access_token.encode("utf-8")
    if not key:
        raise ValueError("APP_ACCESS_TOKEN is required to decrypt legacy settings")
    val_bytes = val.encode("utf-8")
    encrypted = bytes(val_bytes[i] ^ key[i % len(key)] for i in range(len(val_bytes)))
    return base64.b64encode(encrypted).decode("utf-8")


def _xor_decrypt_val(val: str) -> str:
    if not val:
        return ""
    key = settings.app_access_token.encode("utf-8")
    if not key:
        raise ValueError("APP_ACCESS_TOKEN is required to decrypt legacy settings")
    encrypted = base64.b64decode(val.encode("utf-8"))
    decrypted = bytes(encrypted[i] ^ key[i % len(key)] for i in range(len(encrypted)))
    return decrypted.decode("utf-8")


def _fernet() -> Fernet:
    key = (settings.settings_encryption_key or "").strip()
    if not key:
        if settings.app_env.lower() == "development":
            key_bytes = settings.app_access_token.encode("utf-8")
            key = base64.urlsafe_b64encode(key_bytes.ljust(32, b"0")[:32]).decode("ascii")
        else:
            raise ValueError("SETTINGS_ENCRYPTION_KEY must be set to save API keys outside development")
    try:
        return Fernet(key.encode("ascii"))
    except Exception as exc:
        raise ValueError("SETTINGS_ENCRYPTION_KEY must be a valid Fernet key") from exc


def _encrypt_val(val: str) -> str:
    if not val:
        return ""
    token = _fernet().encrypt(val.encode("utf-8")).decode("ascii")
    return FERNET_PREFIX + token


def _decrypt_val(val: str) -> str:
    if not val:
        return ""
    if val.startswith(FERNET_PREFIX):
        token = val[len(FERNET_PREFIX):].encode("ascii")
        try:
            return _fernet().decrypt(token).decode("utf-8")
        except (InvalidToken, ValueError) as exc:
            raise ValueError("Stored AI API key cannot be decrypted; re-save it in Settings") from exc
    if val.startswith(XOR_PREFIX):
        return _xor_decrypt_val(val[len(XOR_PREFIX):])
    try:
        return _xor_decrypt_val(val)
    except Exception:
        # Legacy plaintext values were possible before encrypted storage existed.
        return val


def tts_params(cfg: dict, lang: str) -> tuple[str, str, str]:
    if lang == "english":
        return cfg.get("english_voice", "en-US-JennyNeural"), cfg.get("english_rate", "+0%"), cfg.get("english_volume", "+0%")
    else:
        return cfg.get("chinese_voice", "zh-CN-XiaoxiaoNeural"), cfg.get("chinese_rate", "+0%"), cfg.get("chinese_volume", "+0%")


def validate_ai_base_url(value: str) -> str:
    val = str(value or "").strip()
    parsed = urlparse(val)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("AI Base URL must be an http(s) URL with a host")
    if parsed.query or parsed.fragment:
        raise ValueError("AI Base URL must not include query parameters or fragments")
    
    from app.core.security import validate_url_ssrf
    validate_url_ssrf(val)
    
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def get_settings(db: Session) -> dict:
    rows = db.query(AppSetting).all()
    values = DEFAULT_SETTINGS.copy()
    for row in rows:
        try:
            val = json.loads(row.value)
        except json.JSONDecodeError:
            val = row.value
        if row.key == "ai_api_key":
            val = _decrypt_val(val)
        values[row.key] = val
    if settings.ai_api_key:
        values["ai_api_key"] = settings.ai_api_key
    return values


def serialize_settings(values: dict) -> dict:
    data = values.copy()
    api_key = str(data.pop("ai_api_key", "") or "")
    data["ai_api_key_configured"] = bool(api_key)
    if api_key:
        data["ai_api_key_masked"] = "********"
    data["audio_retention_days"] = settings.audio_retention_days
    return data


def update_settings(db: Session, payload: dict) -> dict:
    updates = {}
    for key, value in payload.items():
        if key not in DEFAULT_SETTINGS:
            continue
        if value is None:
            continue
        if key == "ai_api_key":
            if settings.ai_api_key:
                continue
            if not str(value or "").strip():
                continue
            value = _encrypt_val(str(value).strip())
        if key == "ai_base_url":
            value = validate_ai_base_url(str(value))
        updates[key] = value

    for key, value in updates.items():
        row = db.get(AppSetting, key)
        encoded = json.dumps(value, ensure_ascii=False)
        if not row:
            row = AppSetting(key=key, value=encoded)
            db.add(row)
        else:
            row.value = encoded
    db.commit()
    return get_settings(db)
