import hashlib
import shutil
from pathlib import Path

import edge_tts
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.schemas import OkOut, SettingsOut, SettingsUpdate, TtsPreviewRequest, VoiceOut
from app.core.config import settings
from app.core.security import require_access_token
from app.core.utils import ensure_dir, safe_path_under
from app.db.session import get_db
from app.services.settings_service import get_settings, serialize_settings, update_settings, tts_params
from app.services.tts_service import synthesize

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_access_token)])


@router.get("", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return serialize_settings(get_settings(db))


@router.put("", response_model=SettingsOut)
def write_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    try:
        values = update_settings(db, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_settings(values)


_cached_voices = None


@router.get("/tts-voices", response_model=list[VoiceOut])
async def tts_voices():
    global _cached_voices
    if _cached_voices is None:
        voices = await edge_tts.list_voices()
        _cached_voices = [
            {"name": voice.get("ShortName"), "locale": voice.get("Locale"), "gender": voice.get("Gender")}
            for voice in voices
        ]
    return _cached_voices


@router.post("/tts-preview")
async def tts_preview(payload: TtsPreviewRequest, db: Session = Depends(get_db)):
    cfg = get_settings(db)
    lang = payload.lang
    text = payload.text or ("This is a preview of the English voice." if lang == "english" else "这是一段中文语音试听。")
    v_voice, v_rate, v_volume = tts_params(cfg, lang)
    voice = payload.voice or v_voice
    rate = v_rate
    volume = v_volume
    cache_key = hashlib.sha256(f"{lang}\n{voice}\n{rate}\n{volume}\n{text}".encode("utf-8")).hexdigest()[:24]
    out_dir = ensure_dir(Path(settings.storage_dir) / "cache" / "tts_preview")
    out = safe_path_under(out_dir / f"{lang}_{cache_key}.mp3", out_dir)
    if out.exists() and out.stat().st_size > 0:
        return FileResponse(out, media_type="audio/mpeg", filename=out.name)
    try:
        await synthesize(text, voice, out, rate=rate, volume=volume)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "edge-tts preview failed. Microsoft TTS returned an error or rejected the WebSocket connection. "
                "Try upgrading edge-tts, checking system time, or changing network/proxy. "
                f"Original error: {exc}"
            ),
        ) from exc
    return FileResponse(out, media_type="audio/mpeg", filename=out.name)


def clear_directory_safe(directory: Path, max_age_seconds: float = 7200):
    if not directory.exists():
        return
    import time
    now = time.time()
    for item in directory.iterdir():
        try:
            if now - item.stat().st_mtime <= max_age_seconds:
                continue
            if item.is_file() or item.is_symlink():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
        except Exception:
            pass


@router.post("/clear-cache", response_model=OkOut)
def clear_cache():
    cache_dir = Path(settings.storage_dir) / "cache"
    tmp_dir = Path(settings.storage_dir) / "tmp"
    clear_directory_safe(cache_dir)
    clear_directory_safe(tmp_dir)
    return {"ok": True}
