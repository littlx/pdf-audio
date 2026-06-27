from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse, FileResponse
import re
from sqlalchemy.orm import Session
import asyncio
import json
from contextlib import contextmanager
from pathlib import Path
import shutil

from redis import Redis, RedisError

from app.core.config import settings
from app.core.security import require_access_token
from app.db.models import BilingualSegment, ConversionTask, PdfFile, AudioFile
from app.db.session import get_db, db_session
from app.core.utils import safe_path_under
from app.services.artifact_service import delete_artifacts, get_artifact, set_artifact
from app.workers.tasks import create_task, enqueue_task
from app.api.schemas import OkOut, TaskCreate, TaskDetailOut, TaskOut, TaskTextUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"], dependencies=[Depends(require_access_token)])

SAFE_TEXT_EDIT_STATUSES = {"paused", "failed"}
TERMINAL_STATUSES = {"completed", "failed", "paused", "canceled"}
ACTIVE_STATUSES = {"pending", "running", "canceling"}


def get_task_or_404(db: Session, task_id: str) -> ConversionTask:
    task = db.get(ConversionTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def conflict(message: str) -> None:
    raise HTTPException(status_code=409, detail=message)


def enqueue_or_503(task_id: str) -> None:
    try:
        enqueue_task(task_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Worker queue unavailable") from exc


def ensure_active_capacity(db: Session) -> None:
    active_tasks = db.query(ConversionTask).filter(ConversionTask.status.in_(list(ACTIVE_STATUSES))).count()
    if active_tasks >= settings.max_active_tasks:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many concurrent running or pending tasks. Please wait for existing tasks to complete."
        )


def restore_task_state(db: Session, task: ConversionTask, snapshot: dict) -> None:
    for key, value in snapshot.items():
        setattr(task, key, value)
    db.commit()


def safe_rmtree_under(path: Path, base: Path) -> None:
    safe_path = safe_path_under(path, base)
    shutil.rmtree(safe_path, ignore_errors=True)


@contextmanager
def active_task_admission_lock():
    redis: Redis | None = None
    lock = None
    try:
        redis = Redis.from_url(settings.redis_url)
        lock = redis.lock("pdf-audio:active-task-admission", timeout=10, blocking_timeout=5)
        if not lock.acquire(blocking=True):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Task admission lock unavailable")
    except RedisError as exc:
        if settings.app_env.lower() != "development":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Task admission lock unavailable") from exc
        lock = None
    try:
        yield
    finally:
        if lock and lock.owned():
            lock.release()
        if redis:
            redis.close()


@router.post("", response_model=TaskOut)
def create(payload: TaskCreate, db: Session = Depends(get_db)):
    if payload.input_type == "page_range":
        if not payload.pdf_id:
            raise HTTPException(status_code=400, detail="pdf_id is required for page range conversion")
        if not db.get(PdfFile, payload.pdf_id):
            raise HTTPException(status_code=404, detail="PDF not found")
        if not payload.page_expression:
            raise HTTPException(status_code=400, detail="page_expression is required")
    if payload.input_type == "selected_text" and not payload.selected_text:
        raise HTTPException(status_code=400, detail="selected_text is required")
    
    with active_task_admission_lock():
        ensure_active_capacity(db)
        task = create_task(db, payload.model_dump())
        try:
            enqueue_or_503(task.id)
        except Exception as exc:
            # Enqueue failed: remove the database entry to avoid leaving a dead pending task
            db.delete(task)
            db.commit()
            raise exc
    db.refresh(task)
    return task


@router.get("", response_model=list[TaskOut])
def list_tasks(limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0), db: Session = Depends(get_db)):
    tasks = db.query(ConversionTask).order_by(ConversionTask.created_at.desc()).offset(offset).limit(limit).all()
    return tasks


@router.get("/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    segments = [
        {"index": s.segment_index, "english": s.english, "chinese": s.chinese}
        for s in db.query(BilingualSegment).filter(BilingualSegment.task_id == task.id).order_by(BilingualSegment.segment_index).all()
    ]
    extracted_text = get_artifact(db, task.id, "edited_text") or get_artifact(db, task.id, "extracted_text")
    
    # Scan task clips folder for completed clips
    completed_clips = []
    clips_dir = Path(settings.storage_dir) / "tasks" / task.id / "clips"
    if clips_dir.exists():
        for file in clips_dir.glob("*.mp3"):
            completed_clips.append(file.stem) # e.g. "0001_english"
            
    data = TaskOut.model_validate(task).model_dump()
    data["segments"] = segments
    data["extracted_text"] = extracted_text
    data["completed_clips"] = completed_clips
    return data


@router.patch("/{task_id}/text", response_model=TaskOut)
def update_text(task_id: str, payload: TaskTextUpdate, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status not in SAFE_TEXT_EDIT_STATUSES:
        conflict("Task text can only be edited while paused or failed")
    text = payload.text
    task.edited_text = text
    db.query(BilingualSegment).filter(BilingualSegment.task_id == task_id).delete()
    audio = db.query(AudioFile).filter(AudioFile.task_id == task_id).first()
    if audio:
        safe_rmtree_under(Path(settings.storage_dir) / "audios" / audio.id, Path(settings.storage_dir) / "audios")
        db.delete(audio)
    delete_artifacts(db, task.id, ["segments_done", "clip_manifest", "audio_id", "audio_path", "subtitle_json_path", "subtitle_vtt_path", "subtitle_srt_path"])
    
    # We clean up the entire task storage directory here because clip generation, audio merging,
    # and subtitle outputs are entirely dependent on the text segment offsets and layout structures.
    # Editing the text changes these references, invalidating all downstream clips and files.
    safe_rmtree_under(Path(settings.storage_dir) / "tasks" / task.id, Path(settings.storage_dir) / "tasks")
    
    set_artifact(db, task.id, "edited_text", text)
    db.commit()
    return task


@router.post("/{task_id}/pause", response_model=TaskOut)
def pause_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status not in {"pending", "running"}:
        conflict("Only pending or running tasks can be paused")
    task.pause_requested = True
    db.commit()
    return task


@router.post("/{task_id}/cancel", response_model=TaskOut)
def cancel_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status == "canceled":
        return task
    if task.status in {"completed", "failed"}:
        conflict("Task is already terminal")
    task.cancel_requested = True
    if task.status == "pending":
        task.status = "canceled"
        task.stage = "canceled"
    else:
        task.status = "canceling"
    db.commit()
    return task


@router.post("/{task_id}/resume", response_model=TaskOut)
def resume_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status != "paused":
        conflict("Only paused tasks can be resumed")
    with active_task_admission_lock():
        ensure_active_capacity(db)
        snapshot = {
            "pause_requested": task.pause_requested,
            "cancel_requested": task.cancel_requested,
            "status": task.status,
            "error_message": task.error_message,
            "rq_job_id": task.rq_job_id,
            "attempt": task.attempt,
        }
        task.pause_requested = False
        task.cancel_requested = False
        task.status = "pending"
        task.error_message = None
        db.commit()
        try:
            enqueue_or_503(task.id)
        except Exception:
            restore_task_state(db, task, snapshot)
            raise
    db.refresh(task)
    return task


@router.post("/{task_id}/retry", response_model=TaskOut)
def retry_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status not in {"failed", "paused"}:
        conflict("Only failed or paused tasks can be retried")
    with active_task_admission_lock():
        ensure_active_capacity(db)
        snapshot = {
            "pause_requested": task.pause_requested,
            "cancel_requested": task.cancel_requested,
            "status": task.status,
            "stage": task.stage,
            "progress": task.progress,
            "error_message": task.error_message,
            "rq_job_id": task.rq_job_id,
            "attempt": task.attempt,
        }
        task.pause_requested = False
        task.cancel_requested = False
        task.status = "pending"
        task.stage = "pending"
        task.progress = 0
        task.error_message = None
        db.commit()
        try:
            enqueue_or_503(task.id)
        except Exception:
            restore_task_state(db, task, snapshot)
            raise
    db.refresh(task)
    return task


active_sse_connections = 0
MAX_SSE_CONNECTIONS = 50


@router.get("/{task_id}/events")
async def task_events(task_id: str):
    global active_sse_connections
    if active_sse_connections >= MAX_SSE_CONNECTIONS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many concurrent SSE connections. Please try again later."
        )

    async def event_stream():
        global active_sse_connections
        active_sse_connections += 1
        last = None
        try:
            while True:
                with db_session() as db:
                    task = db.get(ConversionTask, task_id)
                    if not task:
                        yield "event: error\ndata: Task not found\n\n"
                        break
                    task_data = TaskOut.model_validate(task).model_dump()
                    data = json.dumps(task_data, ensure_ascii=False)
                
                if data != last:
                    last = data
                    yield f"data: {data}\n\n"
                
                if task_data["status"] in TERMINAL_STATUSES:
                    break
                await asyncio.sleep(1.0)
        finally:
            active_sse_connections -= 1

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/{task_id}", response_model=OkOut)
def delete_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    # If the task is active (pending, running, canceling), attempt to cancel its RQ job in Redis first
    if task.status in ACTIVE_STATUSES:
        try:
            from rq.job import Job
            redis_conn = Redis.from_url(settings.redis_url)
            if task.rq_job_id:
                try:
                    job = Job.fetch(task.rq_job_id, connection=redis_conn)
                    job.cancel()
                except Exception:
                    pass
        except Exception:
            pass

    # Delete associated AudioFile if exists
    audio = db.query(AudioFile).filter(AudioFile.task_id == task_id).first()
    if audio:
        safe_rmtree_under(Path(settings.storage_dir) / "audios" / audio.id, Path(settings.storage_dir) / "audios")
        db.delete(audio)

    # Delete segments
    db.query(BilingualSegment).filter(BilingualSegment.task_id == task_id).delete()

    # Delete artifacts
    delete_artifacts(db, task.id, ["edited_text", "extracted_text", "pages", "segments_done", "clip_manifest", "audio_id", "audio_path", "subtitle_json_path", "subtitle_vtt_path", "subtitle_srt_path"])
    
    # Delete task folder from storage
    safe_rmtree_under(Path(settings.storage_dir) / "tasks" / task.id, Path(settings.storage_dir) / "tasks")
    
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.get("/{task_id}/clips/{clip_key}")
def get_task_clip(task_id: str, clip_key: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    # Check bounds of clip_key to prevent directory traversal
    if not re.match(r"^\d{4}_(english|chinese)$", clip_key):
        raise HTTPException(status_code=400, detail="Invalid clip key")
        
    clip_path = Path(settings.storage_dir) / "tasks" / task.id / "clips" / f"{clip_key}.mp3"
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
        
    return FileResponse(clip_path, media_type="audio/mpeg")
