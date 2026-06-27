import asyncio
import json
import logging
import shutil
import threading
from pathlib import Path

from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.utils import ensure_dir, new_id, utcnow
from app.db.models import AudioFile, BilingualSegment, ConversionTask, PdfFile, TaskStage, STAGE_PROGRESS
from app.db.session import SessionLocal
from app.services.ai_service import generate_bilingual_segments
from app.services.artifact_service import get_artifact, get_json_artifact, path_exists_artifact, set_artifact
from app.services.settings_service import get_settings, tts_params
from app.services.text_extraction import extract_text_from_pdf, parse_page_expression
from app.services.tts_service import audio_dir, concat_mp3, ffprobe_duration, normalize_audio, silence_mp3, synthesize, task_dir, write_subtitles

logger = logging.getLogger(__name__)


def queue() -> Queue:
    redis = Redis.from_url(settings.redis_url)
    return Queue("default", connection=redis)


def enqueue_task(task_id: str) -> None:
    job_id = f"task_{task_id}"
    try:
        queue().enqueue("app.workers.tasks.run_conversion_task", task_id, job_id=job_id, job_timeout="2h")
        logger.info("Enqueued conversion task %s", task_id)
    except Exception as exc:
        if "already exists" in str(exc).lower():
            logger.info("Conversion task %s is already enqueued", task_id)
            return
        if not (settings.worker_fallback_to_thread and settings.app_env.lower() == "development"):
            logger.exception("Failed to enqueue conversion task %s", task_id)
            raise
        logger.exception("Failed to enqueue conversion task %s; running in-process fallback thread", task_id)
        thread = threading.Thread(target=run_conversion_task, args=(task_id,), daemon=True)
        thread.start()


def update_task(db: Session, task: ConversionTask, status: str, stage: str, progress: int, error: str | None = None) -> None:
    task.status = status
    task.stage = stage
    task.progress = progress
    task.error_message = error
    task.updated_at = utcnow()
    db.commit()


def check_control(db: Session, task: ConversionTask) -> None:
    db.refresh(task)
    if task.cancel_requested or task.status == "canceling":
        update_task(db, task, "canceled", task.stage, task.progress)
        raise RuntimeError("Task canceled")
    if task.pause_requested:
        update_task(db, task, "paused", task.stage, task.progress)
        raise RuntimeError("Task paused")


def create_task(db: Session, payload: dict) -> ConversionTask:
    pdf = db.get(PdfFile, payload.get("pdf_id")) if payload.get("pdf_id") else None
    cfg = get_settings(db)
    task = ConversionTask(
        id=new_id("task"),
        pdf_id=pdf.id if pdf else None,
        source_pdf_name=pdf.original_name if pdf else payload.get("source_pdf_name"),
        input_type=payload["input_type"],
        page_expression=payload.get("page_expression"),
        selected_text=payload.get("selected_text"),
        bilingual_format=payload.get("bilingual_format") or cfg["default_bilingual_format"],
        output_style=payload.get("output_style") or cfg["default_output_style"],
        audio_mode=payload.get("audio_mode") or "bilingual",
        ai_model=cfg.get("ai_model") or "deepseek-v4-flash",
        status="pending",
        stage="pending",
        custom_title=payload.get("custom_title"),
    )
    if pdf and task.page_expression:
        task.page_count = len(parse_page_expression(task.page_expression, pdf.page_count))
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _ensure_text(db: Session, task: ConversionTask) -> str:
    existing = get_artifact(db, task.id, "edited_text") or get_artifact(db, task.id, "extracted_text")
    if existing:
        return existing
    update_task(db, task, "running", TaskStage.EXTRACTING_TEXT, STAGE_PROGRESS[TaskStage.EXTRACTING_TEXT])
    if task.input_type == "selected_text":
        text = (task.selected_text or "").strip()
        if len(text) < 20:
            raise ValueError("Selected text is too short")
        set_artifact(db, task.id, "extracted_text", text)
        return text
    if not task.pdf_id:
        raise ValueError("PDF is missing")
    pdf = db.get(PdfFile, task.pdf_id)
    if not pdf:
        raise ValueError("PDF has been deleted")
    text, pages = extract_text_from_pdf(pdf.file_path, task.page_expression or "", pdf.page_count)
    task.page_count = len(pages)
    set_artifact(db, task.id, "pages", pages)
    set_artifact(db, task.id, "extracted_text", text)
    return text


async def _ensure_segments(db: Session, task: ConversionTask, text: str) -> list[BilingualSegment]:
    existing = db.query(BilingualSegment).filter(BilingualSegment.task_id == task.id).order_by(BilingualSegment.segment_index).all()
    if existing:
        return existing
    update_task(db, task, "running", TaskStage.GENERATING_BILINGUAL_TEXT, STAGE_PROGRESS[TaskStage.GENERATING_BILINGUAL_TEXT])
    data = await generate_bilingual_segments(db, text, task.bilingual_format, task.output_style)
    rows = []
    for item in data:
        row = BilingualSegment(
            id=new_id("seg"),
            task_id=task.id,
            segment_index=int(item["index"]),
            english=item["english"],
            chinese=item["chinese"],
        )
        db.add(row)
        rows.append(row)
    db.commit()
    set_artifact(db, task.id, "segments_done", True)
    return db.query(BilingualSegment).filter(BilingualSegment.task_id == task.id).order_by(BilingualSegment.segment_index).all()


def _clip_items(segments: list[BilingualSegment], audio_mode: str) -> list[tuple[int, str, str]]:
    items = []
    for segment in segments:
        if audio_mode in {"bilingual", "english"}:
            items.append((segment.segment_index, "english", segment.english))
        if audio_mode in {"bilingual", "chinese"}:
            items.append((segment.segment_index, "chinese", segment.chinese))
    return items


async def _ensure_clips(db: Session, task: ConversionTask, segments: list[BilingualSegment]) -> list[dict]:
    manifest = get_json_artifact(db, task.id, "clip_manifest") or []
    done = {item["key"]: item for item in manifest if Path(item["path"]).exists()}
    cfg = get_settings(db)
    tmp = ensure_dir(task_dir(task.id) / "clips")
    items = _clip_items(segments, task.audio_mode)
    total = max(len(items), 1)
    try:
        for idx, (segment_index, lang, text) in enumerate(items, start=1):
            check_control(db, task)
            key = f"{segment_index:04d}_{lang}"
            if key in done:
                continue
            update_task(db, task, "running", TaskStage.GENERATING_TTS_CLIPS, STAGE_PROGRESS[TaskStage.GENERATING_TTS_CLIPS] + int(idx / total * 25))
            voice, rate, volume = tts_params(cfg, lang)
            path = tmp / f"{key}.mp3"
            await synthesize(text, voice, path, rate=rate, volume=volume)
            duration = ffprobe_duration(path)
            done[key] = {"key": key, "segment_index": segment_index, "lang": lang, "text": text, "path": str(path), "duration": duration}
            
            # Periodic batch write for safety
            if idx % 10 == 0:
                set_artifact(db, task.id, "clip_manifest", list(done.values()))
    finally:
        ordered = [done[f"{segment_index:04d}_{lang}"] for segment_index, lang, _ in items if f"{segment_index:04d}_{lang}" in done]
        set_artifact(db, task.id, "clip_manifest", ordered)
    return ordered


def _ensure_audio_and_subtitles(db: Session, task: ConversionTask, clips: list[dict]) -> AudioFile:
    existing_audio = db.query(AudioFile).filter(AudioFile.task_id == task.id).first()
    if existing_audio and Path(existing_audio.audio_path).exists():
        return existing_audio

    update_task(db, task, "running", TaskStage.MERGING_AUDIO, STAGE_PROGRESS[TaskStage.MERGING_AUDIO])
    audio_id = new_id("audio")
    out_dir = audio_dir(audio_id)
    cfg = get_settings(db)
    lang_pause = int(cfg.get("pause_between_languages_ms") or 500)
    seg_pause = int(cfg.get("pause_between_segments_ms") or 800)
    lang_silence = task_dir(task.id) / "silence_lang.mp3"
    seg_silence = task_dir(task.id) / "silence_seg.mp3"
    if not lang_silence.exists():
        silence_mp3(lang_silence, lang_pause)
    if not seg_silence.exists():
        silence_mp3(seg_silence, seg_pause)

    # Cache duration checks for the two silence files
    lang_dur = ffprobe_duration(lang_silence)
    seg_dur = ffprobe_duration(seg_silence)

    concat_files: list[Path] = []
    subtitle_entries = []
    current = 0.0
    for idx, clip in enumerate(clips):
        path = Path(clip["path"])
        concat_files.append(path)
        start = current
        end = current + float(clip["duration"])
        subtitle_entries.append({"segment_index": clip["segment_index"], "lang": clip["lang"], "start": start, "end": end, "text": clip["text"]})
        current = end
        next_clip = clips[idx + 1] if idx + 1 < len(clips) else None
        if next_clip:
            silence = seg_silence if next_clip["segment_index"] != clip["segment_index"] else lang_silence
            concat_files.append(silence)
            current += seg_dur if next_clip["segment_index"] != clip["segment_index"] else lang_dur

    merged = task_dir(task.id) / "merged.mp3"
    normalized = out_dir / "final.mp3"
    concat_mp3(concat_files, merged)
    update_task(db, task, "running", TaskStage.NORMALIZING_AUDIO, STAGE_PROGRESS[TaskStage.NORMALIZING_AUDIO])
    normalize_audio(merged, normalized)
    duration = ffprobe_duration(normalized)
    update_task(db, task, "running", TaskStage.GENERATING_SUBTITLES, STAGE_PROGRESS[TaskStage.GENERATING_SUBTITLES])
    vtt, srt, json_path = write_subtitles(subtitle_entries, out_dir)

    audio = AudioFile(
        id=audio_id,
        task_id=task.id,
        pdf_id=task.pdf_id,
        title=task.custom_title or f"{task.source_pdf_name or 'Selected text'} - {task.page_expression or 'Selection'}",
        source_pdf_name=task.source_pdf_name,
        page_expression=task.page_expression,
        audio_mode=task.audio_mode,
        audio_path=str(normalized),
        subtitle_vtt_path=str(vtt),
        subtitle_srt_path=str(srt),
        subtitle_json_path=str(json_path),
        duration=duration,
        format="mp3",
    )
    db.add(audio)
    db.commit()
    set_artifact(db, task.id, "audio_id", audio.id)
    return audio


async def async_run_conversion_task(task_id: str) -> None:
    db = SessionLocal()
    try:
        task = db.get(ConversionTask, task_id)
        if not task:
            return
        if task.status == "running":
            return
        if task.cancel_requested or task.status == "canceled":
            update_task(db, task, "canceled", TaskStage.CANCELED, task.progress or 0)
            return
        task.pause_requested = False
        update_task(db, task, "running", task.stage or TaskStage.PENDING, task.progress or 0)
        check_control(db, task)
        text = _ensure_text(db, task)
        update_task(db, task, "running", TaskStage.TEXT_READY, STAGE_PROGRESS[TaskStage.TEXT_READY])
        check_control(db, task)
        text = task.edited_text or get_artifact(db, task.id, "edited_text") or text
        segments = await _ensure_segments(db, task, text)
        update_task(db, task, "running", TaskStage.BILINGUAL_TEXT_READY, STAGE_PROGRESS[TaskStage.BILINGUAL_TEXT_READY])
        check_control(db, task)
        clips = await _ensure_clips(db, task, segments)
        update_task(db, task, "running", TaskStage.CLIPS_READY, STAGE_PROGRESS[TaskStage.CLIPS_READY])
        check_control(db, task)
        audio = _ensure_audio_and_subtitles(db, task, clips)
        task.completed_at = utcnow()
        update_task(db, task, "completed", TaskStage.COMPLETED, STAGE_PROGRESS[TaskStage.COMPLETED])
    except Exception as exc:
        if isinstance(exc, RuntimeError) and str(exc) in {"Task paused", "Task canceled"}:
            pass
        else:
            task = db.get(ConversionTask, task_id)
            if task:
                update_task(db, task, "failed", task.stage, task.progress, str(exc))
    finally:
        db.close()


def run_conversion_task(task_id: str) -> None:
    asyncio.run(async_run_conversion_task(task_id))
