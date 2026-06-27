import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import require_access_token
from app.core.utils import new_id, safe_path_under
from app.db.models import AudioFile, ConversionTask, PlaybackRecord
from app.db.session import get_db
from app.api.schemas import AudioOut, OkOut, PlaybackIn, PlaybackOut, AudioRename

router = APIRouter(prefix="/api/audios", tags=["audios"], dependencies=[Depends(require_access_token)])
ACTIVE_TASK_STATUSES = {"pending", "running", "canceling"}


def get_audio_or_404(db: Session, audio_id: str) -> AudioFile:
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return audio


def audio_storage_dir(audio_id: str) -> Path:
    return Path(settings.storage_dir) / "audios" / audio_id


def safe_audio_dir(audio_id: str) -> Path:
    return safe_path_under(audio_storage_dir(audio_id), Path(settings.storage_dir) / "audios")


@router.get("", response_model=list[AudioOut])
def list_audios(limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    audios = db.query(AudioFile).order_by(AudioFile.created_at.desc()).offset(offset).limit(limit).all()
    return audios


@router.get("/{audio_id}", response_model=AudioOut)
def get_audio(audio_id: str, db: Session = Depends(get_db)):
    return get_audio_or_404(db, audio_id)


@router.delete("/{audio_id}", response_model=OkOut)
def delete_audio(audio_id: str, db: Session = Depends(get_db)):
    audio = get_audio_or_404(db, audio_id)
    if audio.task_id:
        task = db.get(ConversionTask, audio.task_id)
        if task and task.status in ACTIVE_TASK_STATUSES:
            raise HTTPException(status_code=409, detail="Cancel the source task and wait for it to stop before deleting this audio")
    target_dir = safe_audio_dir(audio_id)
    safe_path_under(audio.audio_path, target_dir)
    for path_attr in ("subtitle_json_path", "subtitle_vtt_path", "subtitle_srt_path"):
        path = getattr(audio, path_attr)
        if path:
            safe_path_under(path, target_dir)
    shutil.rmtree(target_dir, ignore_errors=True)
    db.delete(audio)
    db.commit()
    return {"ok": True}


def _serve_audio_file(db: Session, audio_id: str, path_attr: str, media_type: str, default_filename: str):
    audio = get_audio_or_404(db, audio_id)
    path = getattr(audio, path_attr)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    safe_path = safe_path_under(path, safe_audio_dir(audio_id))
    if not safe_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    filename = f"{audio.title}.mp3" if path_attr == "audio_path" else default_filename
    return FileResponse(safe_path, media_type=media_type, filename=filename)


@router.get("/{audio_id}/file")
def audio_file(audio_id: str, db: Session = Depends(get_db)):
    return _serve_audio_file(db, audio_id, "audio_path", "audio/mpeg", "audio.mp3")


@router.get("/{audio_id}/subtitles.json")
def subtitles_json(audio_id: str, db: Session = Depends(get_db)):
    return _serve_audio_file(db, audio_id, "subtitle_json_path", "application/json", "subtitles.json")


@router.get("/{audio_id}/subtitles.vtt")
def subtitles_vtt(audio_id: str, db: Session = Depends(get_db)):
    return _serve_audio_file(db, audio_id, "subtitle_vtt_path", "text/vtt", "subtitles.vtt")


@router.get("/{audio_id}/subtitles.srt")
def subtitles_srt(audio_id: str, db: Session = Depends(get_db)):
    return _serve_audio_file(db, audio_id, "subtitle_srt_path", "text/plain", "subtitles.srt")


@router.get("/{audio_id}/playback", response_model=PlaybackOut)
def get_playback(audio_id: str, db: Session = Depends(get_db)):
    row = db.query(PlaybackRecord).filter(PlaybackRecord.audio_id == audio_id).first()
    if not row:
        return {"current_time": 0, "playback_rate": 1, "loop_current_segment": False}
    return {"current_time": row.current_time, "playback_rate": row.playback_rate, "loop_current_segment": row.loop_current_segment}


@router.put("/{audio_id}/playback", response_model=OkOut)
def save_playback(audio_id: str, payload: PlaybackIn, db: Session = Depends(get_db)):
    get_audio_or_404(db, audio_id)
    row = db.query(PlaybackRecord).filter(PlaybackRecord.audio_id == audio_id).first()
    if not row:
        row = PlaybackRecord(id=new_id("playback"), audio_id=audio_id)
        db.add(row)
    row.current_time = payload.current_time
    row.playback_rate = payload.playback_rate
    row.loop_current_segment = payload.loop_current_segment
    db.commit()
    return {"ok": True}


@router.patch("/{audio_id}/rename", response_model=AudioOut)
def rename_audio(audio_id: str, payload: AudioRename, db: Session = Depends(get_db)):
    audio = get_audio_or_404(db, audio_id)
    audio.title = payload.title.strip()
    db.commit()
    return audio
