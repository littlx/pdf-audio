import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import require_access_token
from app.core.utils import new_id, safe_path_under
from app.db.models import AudioFile, PlaybackRecord
from app.db.session import get_db
from app.api.schemas import AudioOut, OkOut, PlaybackIn, PlaybackOut

router = APIRouter(prefix="/api/audios", tags=["audios"], dependencies=[Depends(require_access_token)])


def serialize_audio(audio: AudioFile) -> dict:
    return {
        "id": audio.id,
        "task_id": audio.task_id,
        "title": audio.title,
        "source_pdf_name": audio.source_pdf_name,
        "page_expression": audio.page_expression,
        "audio_mode": audio.audio_mode,
        "duration": audio.duration,
        "created_at": audio.created_at.isoformat(),
        "audio_url": f"/api/audios/{audio.id}/file",
        "subtitle_json_url": f"/api/audios/{audio.id}/subtitles.json",
        "subtitle_vtt_url": f"/api/audios/{audio.id}/subtitles.vtt",
        "subtitle_srt_url": f"/api/audios/{audio.id}/subtitles.srt",
    }


def audio_storage_dir(audio_id: str) -> Path:
    return Path(settings.storage_dir) / "audios" / audio_id


@router.get("", response_model=list[AudioOut])
def list_audios(db: Session = Depends(get_db)):
    audios = db.query(AudioFile).order_by(AudioFile.created_at.desc()).all()
    return [serialize_audio(audio) for audio in audios]


@router.get("/{audio_id}", response_model=AudioOut)
def get_audio(audio_id: str, db: Session = Depends(get_db)):
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return serialize_audio(audio)


@router.delete("/{audio_id}", response_model=OkOut)
def delete_audio(audio_id: str, db: Session = Depends(get_db)):
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    safe_path_under(audio.audio_path, audio_storage_dir(audio_id))
    shutil.rmtree(audio_storage_dir(audio_id), ignore_errors=True)
    db.delete(audio)
    db.commit()
    return {"ok": True}


def _file_response(audio: AudioFile, path: str | None, media_type: str, filename: str):
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    safe_path = safe_path_under(path, audio_storage_dir(audio.id))
    if not safe_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(safe_path, media_type=media_type, filename=filename)


@router.get("/{audio_id}/file")
def audio_file(audio_id: str, db: Session = Depends(get_db)):
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return _file_response(audio, audio.audio_path, "audio/mpeg", f"{audio.title}.mp3")


@router.get("/{audio_id}/subtitles.json")
def subtitles_json(audio_id: str, db: Session = Depends(get_db)):
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return _file_response(audio, audio.subtitle_json_path, "application/json", "subtitles.json")


@router.get("/{audio_id}/subtitles.vtt")
def subtitles_vtt(audio_id: str, db: Session = Depends(get_db)):
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return _file_response(audio, audio.subtitle_vtt_path, "text/vtt", "subtitles.vtt")


@router.get("/{audio_id}/subtitles.srt")
def subtitles_srt(audio_id: str, db: Session = Depends(get_db)):
    audio = db.get(AudioFile, audio_id)
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return _file_response(audio, audio.subtitle_srt_path, "text/plain", "subtitles.srt")


@router.get("/{audio_id}/playback", response_model=PlaybackOut)
def get_playback(audio_id: str, db: Session = Depends(get_db)):
    row = db.query(PlaybackRecord).filter(PlaybackRecord.audio_id == audio_id).first()
    if not row:
        return {"current_time": 0, "playback_rate": 1, "loop_current_segment": False}
    return {"current_time": row.current_time, "playback_rate": row.playback_rate, "loop_current_segment": row.loop_current_segment}


@router.put("/{audio_id}/playback", response_model=OkOut)
def save_playback(audio_id: str, payload: PlaybackIn, db: Session = Depends(get_db)):
    if not db.get(AudioFile, audio_id):
        raise HTTPException(status_code=404, detail="Audio not found")
    row = db.query(PlaybackRecord).filter(PlaybackRecord.audio_id == audio_id).first()
    if not row:
        row = PlaybackRecord(id=new_id("playback"), audio_id=audio_id)
        db.add(row)
    row.current_time = payload.current_time
    row.playback_rate = payload.playback_rate
    row.loop_current_segment = payload.loop_current_segment
    db.commit()
    return {"ok": True}
