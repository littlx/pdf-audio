import json
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import require_access_token
from app.db.models import BilingualSegment, ConversionTask, PdfFile
from app.db.session import get_db
from app.core.utils import safe_path_under
from app.services.artifact_service import delete_artifacts, get_artifact, set_artifact
from app.workers.tasks import create_task, enqueue_task
from app.api.schemas import OkOut, TaskCreate, TaskDetailOut, TaskOut, TaskTextUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"], dependencies=[Depends(require_access_token)])

SAFE_TEXT_EDIT_STATUSES = {"pending", "paused", "failed"}


def serialize_task(task: ConversionTask) -> dict:
    return {
        "id": task.id,
        "pdf_id": task.pdf_id,
        "source_pdf_name": task.source_pdf_name,
        "input_type": task.input_type,
        "page_expression": task.page_expression,
        "bilingual_format": task.bilingual_format,
        "output_style": task.output_style,
        "audio_mode": task.audio_mode,
        "status": task.status,
        "stage": task.stage,
        "progress": task.progress,
        "error_message": task.error_message,
    }


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
    task = create_task(db, payload.model_dump())
    enqueue_or_503(task.id)
    return serialize_task(task)


@router.get("", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(ConversionTask).order_by(ConversionTask.created_at.desc()).limit(100).all()
    return [serialize_task(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    data = serialize_task(task)
    data["segments"] = [
        {"index": s.segment_index, "english": s.english, "chinese": s.chinese}
        for s in db.query(BilingualSegment).filter(BilingualSegment.task_id == task.id).order_by(BilingualSegment.segment_index).all()
    ]
    data["extracted_text"] = get_artifact(db, task.id, "edited_text") or get_artifact(db, task.id, "extracted_text")
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
    task_storage = safe_path_under(Path(settings.storage_dir) / "tasks" / task.id, Path(settings.storage_dir) / "tasks")
    shutil.rmtree(task_storage, ignore_errors=True)
    set_artifact(db, task.id, "edited_text", text)
    db.commit()
    return serialize_task(task)


@router.post("/{task_id}/pause", response_model=TaskOut)
def pause_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status not in {"pending", "running"}:
        conflict("Only pending or running tasks can be paused")
    task.pause_requested = True
    db.commit()
    return serialize_task(task)


@router.post("/{task_id}/cancel", response_model=TaskOut)
def cancel_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    if task.status == "canceled":
        return serialize_task(task)
    if task.status in {"completed", "failed"}:
        conflict("Task is already terminal")
    task.cancel_requested = True
    if task.status == "pending":
        task.status = "canceled"
        task.stage = "canceled"
    else:
        task.status = "canceling"
    db.commit()
    return serialize_task(task)


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
    return serialize_task(task)


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
    return serialize_task(task)


@router.get("/{task_id}/events")
def task_events(task_id: str):
    def event_stream():
        from app.db.session import SessionLocal

        last = None
        while True:
            db = SessionLocal()
            task = db.get(ConversionTask, task_id)
            if not task:
                db.close()
                yield "event: error\ndata: Task not found\n\n"
                break
            data = json.dumps(serialize_task(task), ensure_ascii=False)
            db.close()
            if data != last:
                last = data
                yield f"data: {data}\n\n"
            if json.loads(data)["status"] in {"completed", "failed", "paused", "canceled"}:
                break
            time.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
