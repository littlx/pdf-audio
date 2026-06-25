import hashlib
import shutil
from pathlib import Path

import edge_tts
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import require_access_token
from app.core.utils import ensure_dir
from app.db.session import get_db
from app.services.settings_service import get_settings, update_settings
from app.services.tts_service import synthesize

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_access_token)])


@router.get("")
def read_settings(db: Session = Depends(get_db)):
    values = get_settings(db)
    if values.get("ai_api_key"):
        values["ai_api_key_masked"] = "********"
    return values


@router.put("")
def write_settings(payload: dict, db: Session = Depends(get_db)):
    return update_settings(db, payload)


@router.get("/tts-voices")
async def tts_voices():
    voices = await edge_tts.list_voices()
    return [
        {"name": voice.get("ShortName"), "locale": voice.get("Locale"), "gender": voice.get("Gender")}
        for voice in voices
    ]


@router.post("/tts-preview")
async def tts_preview(payload: dict, db: Session = Depends(get_db)):
    cfg = get_settings(db)
    lang = payload.get("lang", "english")
    text = payload.get("text") or ("This is a preview of the English voice." if lang == "english" else "这是一段中文语音试听。")
    voice = payload.get("voice") or (cfg["english_voice"] if lang == "english" else cfg["chinese_voice"])
    rate = cfg["english_rate"] if lang == "english" else cfg["chinese_rate"]
    volume = cfg["english_volume"] if lang == "english" else cfg["chinese_volume"]
    cache_key = hashlib.sha256(f"{lang}\n{voice}\n{rate}\n{volume}\n{text}".encode("utf-8")).hexdigest()[:24]
    out_dir = ensure_dir(Path(settings.storage_dir) / "cache" / "tts_preview")
    out = out_dir / f"{lang}_{cache_key}.mp3"
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


@router.post("/clear-cache")
def clear_cache():
    cache_dir = Path(settings.storage_dir) / "cache"
    tmp_dir = Path(settings.storage_dir) / "tmp"
    shutil.rmtree(cache_dir, ignore_errors=True)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    ensure_dir(cache_dir)
    ensure_dir(tmp_dir)
    return {"ok": True}
