import json
from sqlalchemy.orm import Session

from app.core.utils import new_id
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


def get_settings(db: Session) -> dict:
    rows = db.query(AppSetting).all()
    values = DEFAULT_SETTINGS.copy()
    for row in rows:
        try:
            values[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            values[row.key] = row.value
    return values


def update_settings(db: Session, payload: dict) -> dict:
    for key, value in payload.items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = db.get(AppSetting, key)
        encoded = json.dumps(value, ensure_ascii=False)
        if not row:
            row = AppSetting(key=key, value=encoded)
            db.add(row)
        else:
            row.value = encoded
    db.commit()
    return get_settings(db)
