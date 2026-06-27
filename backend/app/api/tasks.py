from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import json
import shutil
from pathlib import Path

from app.core.config import settings
from app.core.security import require_access_token
from app.db.models import BilingualSegment, ConversionTask, PdfFile, AudioFile
from app.db.session import get_db, db_session
from app.core.utils import safe_path_under
from app.services.artifact_service import delete_artifacts, get_artifact, set_artifact
from app.workers.tasks import create_task, enqueue_task
from app.api.schemas import OkOut, TaskCreate, TaskDetailOut, TaskOut, TaskTextUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"], dependencies=[Depends(require_access_token)])

SAFE_TEXT_EDIT_STATUSES = {"pending", "paused", "failed"}


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
    
    # Enforce concurrency/rate limits
    active_tasks = db.query(ConversionTask).filter(ConversionTask.status.in_(["pending", "running"])).count()
    if active_tasks >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many concurrent running or pending tasks. Please wait for existing tasks to complete."
        )

    task = create_task(db, payload.model_dump())
    try:
        enqueue_or_503(task.id)
    except Exception as exc:
        # Enqueue failed: remove the database entry to avoid leaving a dead pending task
        db.delete(task)
        db.commit()
        raise exc
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
    
    data = TaskOut.model_validate(task).model_dump()
    data["segments"] = segments
    data["extracted_text"] = extracted_text
    return data


@router.patch("/{task_id}/text", response_model=TaskOut)
def update_text(task_id: str, payload: TaskTextUpdate, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status not in SAFE_TEXT_EDIT_STATUSES:
        conflict("Task text can only be edited while pending, paused, or failed")
    text = payload.text
    task.edited_text = text
    db.query(BilingualSegment).filter(BilingualSegment.task_id == task_id).delete()
    delete_artifacts(db, task.id, ["segments_done", "clip_manifest", "audio_path", "subtitle_json_path", "subtitle_vtt_path", "subtitle_srt_path"])
    
    # We clean up the entire task storage directory here because clip generation, audio merging,
    # and subtitle outputs are entirely dependent on the text segment offsets and layout structures.
    # Editing the text changes these references, invalidating all downstream clips and files.
    task_storage = safe_path_under(Path(settings.storage_dir) / "tasks" / task.id, Path(settings.storage_dir) / "tasks")
    shutil.rmtree(task_storage, ignore_errors=True)
    
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
    task.pause_requested = False
    task.cancel_requested = False
    task.status = "pending"
    task.error_message = None
    db.commit()
    enqueue_or_503(task.id)
    return task


@router.post("/{task_id}/retry", response_model=TaskOut)
def retry_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status not in {"failed", "paused"}:
        conflict("Only failed or paused tasks can be retried")
    task.pause_requested = False
    task.cancel_requested = False
    task.status = "pending"
    task.stage = "pending"
    task.progress = 0
    task.error_message = None
    db.commit()
    enqueue_or_503(task.id)
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
                
                if task_data["status"] in {"completed", "failed", "paused", "canceled"}:
                    break
                await asyncio.sleep(1.0)
        finally:
            active_sse_connections -= 1

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/{task_id}", response_model=OkOut)
def delete_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status in {"pending", "running", "canceling"}:
        conflict("Cannot delete an active task. Please cancel it first.")

    # Delete associated AudioFile if exists
    audio = db.query(AudioFile).filter(AudioFile.task_id == task_id).first()
    if audio:
        safe_path_under(audio.audio_path, Path(settings.storage_dir) / "audios" / audio.id)
        shutil.rmtree(Path(settings.storage_dir) / "audios" / audio.id, ignore_errors=True)
        db.delete(audio)

    # Delete segments
    db.query(BilingualSegment).filter(BilingualSegment.task_id == task_id).delete()

    # Delete artifacts
    delete_artifacts(db, task.id, ["edited_text", "extracted_text", "segments_done", "clip_manifest", "audio_path", "subtitle_json_path", "subtitle_vtt_path", "subtitle_srt_path"])
    
    # Delete task folder from storage
    task_storage = safe_path_under(Path(settings.storage_dir) / "tasks" / task.id, Path(settings.storage_dir) / "tasks")
    shutil.rmtree(task_storage, ignore_errors=True)
    
    db.delete(task)
    db.commit()
    return {"ok": True}
