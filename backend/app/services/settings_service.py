import json
from urllib.parse import urlparse

from sqlalchemy.orm import Session

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


def validate_ai_base_url(value: str) -> str:
    parsed = urlparse(str(value or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("AI Base URL must be an http(s) URL with a host")
    if parsed.query or parsed.fragment:
        raise ValueError("AI Base URL must not include query parameters or fragments")
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def get_settings(db: Session) -> dict:
    rows = db.query(AppSetting).all()
    values = DEFAULT_SETTINGS.copy()
    for row in rows:
        try:
            values[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            values[row.key] = row.value
    return values


def serialize_settings(values: dict) -> dict:
    data = values.copy()
    api_key = str(data.pop("ai_api_key", "") or "")
    data["ai_api_key_configured"] = bool(api_key)
    if api_key:
        data["ai_api_key_masked"] = "********"
    return data


def update_settings(db: Session, payload: dict) -> dict:
    updates = {}
    for key, value in payload.items():
        if key not in DEFAULT_SETTINGS:
            continue
        if value is None:
            continue
        if key == "ai_api_key" and not str(value or "").strip():
            continue
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
