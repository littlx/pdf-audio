import asyncio
import json
import logging
import shutil
import threading
import socket
import os
from datetime import timedelta
from pathlib import Path
from typing import Callable

from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.utils import ensure_dir, new_id, utcnow
from app.db.models import AudioFile, BilingualSegment, ConversionTask, PdfFile, TaskStage, STAGE_PROGRESS
from app.db.session import SessionLocal
from app.services.ai_service import generate_bilingual_segments, generate_bilingual_segments_auto
from app.services.artifact_service import get_artifact, get_json_artifact, path_exists_artifact, set_artifact
from app.services.settings_service import get_settings, tts_params
from app.services.text_extraction import extract_text_from_pdf, parse_page_expression
from app.services.tts_service import audio_dir, concat_wav, convert_to_timeline_wav, ffprobe_duration, normalize_audio, silence_wav, synthesize, task_dir, write_subtitles

logger = logging.getLogger(__name__)
TERMINAL_STATUSES = {"completed", "failed", "paused", "canceled"}


def queue() -> Queue:
    redis = Redis.from_url(settings.redis_url)
    return Queue("default", connection=redis)


def enqueue_task(task_id: str) -> None:
    db = SessionLocal()
    try:
        task = db.get(ConversionTask, task_id)
        if not task:
            raise ValueError("Task not found")
        task.attempt = (task.attempt or 0) + 1
        job_id = f"task_{task_id}_{task.attempt}"
        task.rq_job_id = job_id
        task.updated_at = utcnow()
        db.commit()
    finally:
        db.close()

    try:
        queue().enqueue("app.workers.tasks.run_conversion_task", task_id, job_id=job_id, job_timeout="2h")
        logger.info("Enqueued conversion task %s as %s", task_id, job_id)
    except Exception:
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
    if status == "running":
        task.heartbeat_at = utcnow()
    if status in TERMINAL_STATUSES:
        task.worker_id = None
        task.heartbeat_at = None
    db.commit()


def check_control(db: Session, task: ConversionTask) -> None:
    db.refresh(task)
    if task.cancel_requested or task.status == "canceling":
        update_task(db, task, "canceled", task.stage, task.progress)
        raise RuntimeError("Task canceled")
    if task.pause_requested:
        update_task(db, task, "paused", task.stage, task.progress)
        raise RuntimeError("Task paused")


def heartbeat(db: Session, task: ConversionTask) -> None:
    task.heartbeat_at = utcnow()
    task.updated_at = utcnow()
    db.commit()


def is_stale_running(task: ConversionTask) -> bool:
    heartbeat_at = task.heartbeat_at or task.updated_at or task.started_at
    if not heartbeat_at:
        return True
    return utcnow() - heartbeat_at > timedelta(seconds=settings.running_task_stale_seconds)


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
        extract_mode=payload.get("extract_mode") or "auto",
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


def _ensure_text(db: Session, task: ConversionTask, control: Callable[[], None]) -> str:
    existing = get_artifact(db, task.id, "edited_text") or get_artifact(db, task.id, "extracted_text")
    if existing:
        return existing
    control()
    update_task(db, task, "running", TaskStage.EXTRACTING_TEXT, STAGE_PROGRESS[TaskStage.EXTRACTING_TEXT])
    if task.input_type == "selected_text":
        text = (task.selected_text or "").strip()
        if len(text) < 20:
            raise ValueError("Selected text is too short")
        set_artifact(db, task.id, "extracted_text", text)
        control()
        return text
    if not task.pdf_id:
        raise ValueError("PDF is missing")
    pdf = db.get(PdfFile, task.pdf_id)
    if not pdf:
        raise ValueError("PDF has been deleted")
    text, pages = extract_text_from_pdf(pdf.file_path, task.page_expression or "", pdf.page_count)
    control()
    task.page_count = len(pages)
    set_artifact(db, task.id, "pages", pages)
    set_artifact(db, task.id, "extracted_text", text)
    return text


async def _ensure_segments(db: Session, task: ConversionTask, text: str, control: Callable[[], None]) -> list[BilingualSegment]:
    existing = db.query(BilingualSegment).filter(BilingualSegment.task_id == task.id).order_by(BilingualSegment.segment_index).all()
    if existing:
        return existing
    control()
    update_task(db, task, "running", TaskStage.GENERATING_BILINGUAL_TEXT, STAGE_PROGRESS[TaskStage.GENERATING_BILINGUAL_TEXT])
    if task.extract_mode == "auto":
        data = await generate_bilingual_segments_auto(db, text, task.bilingual_format, task.output_style)
    else:
        data = await generate_bilingual_segments(db, text, task.bilingual_format, task.output_style)
    control()
    rows = []
    for idx, item in enumerate(data, start=1):
        row = BilingualSegment(
            id=new_id("seg"),
            task_id=task.id,
            segment_index=idx,
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


async def _ensure_clips(db: Session, task: ConversionTask, segments: list[BilingualSegment], control: Callable[[], None]) -> list[dict]:
    manifest = get_json_artifact(db, task.id, "clip_manifest") or []
    done = {item["key"]: item for item in manifest if Path(item["path"]).exists()}
    cfg = get_settings(db)
    tmp = ensure_dir(task_dir(task.id) / "clips")
    
    # Self-healing check: scan the physical folder to recover any clips that exist on disk
    # but were not yet saved to the database manifest (e.g. due to a crash).
    for file_path in tmp.glob("*.mp3"):
        key = file_path.stem
        if key not in done:
            try:
                parts = key.split("_")
                if len(parts) == 2:
                    segment_index = int(parts[0])
                    lang = parts[1]
                    seg = next((s for s in segments if s.segment_index == segment_index), None)
                    text = ""
                    if seg:
                        text = seg.english if lang == "english" else seg.chinese
                    
                    duration = ffprobe_duration(file_path)
                    done[key] = {
                        "key": key,
                        "segment_index": segment_index,
                        "lang": lang,
                        "text": text,
                        "path": str(file_path),
                        "duration": duration
                    }
                    logger.info("Self-healing recovered clip %s from disk", key)
            except Exception as e:
                logger.warning("Failed to recover clip metadata for %s: %s", key, e)

    items = _clip_items(segments, task.audio_mode)
    total = max(len(items), 1)
    
    # Instantly report correct progress of already completed clips on start/resume!
    initial_progress = STAGE_PROGRESS[TaskStage.GENERATING_TTS_CLIPS] + int(len(done) / total * 25)
    update_task(db, task, "running", TaskStage.GENERATING_TTS_CLIPS, initial_progress)

    try:
        for idx, (segment_index, lang, text) in enumerate(items, start=1):
            control()
            key = f"{segment_index:04d}_{lang}"
            if key in done:
                continue
            update_task(db, task, "running", TaskStage.GENERATING_TTS_CLIPS, STAGE_PROGRESS[TaskStage.GENERATING_TTS_CLIPS] + int(idx / total * 25))
            voice, rate, volume = tts_params(cfg, lang)
            path = tmp / f"{key}.mp3"
            await synthesize(text, voice, path, rate=rate, volume=volume)
            control()
            duration = ffprobe_duration(path)
            done[key] = {"key": key, "segment_index": segment_index, "lang": lang, "text": text, "path": str(path), "duration": duration}
            
            # Periodic batch write for safety
            if idx % 10 == 0:
                set_artifact(db, task.id, "clip_manifest", list(done.values()))
                heartbeat(db, task)
    finally:
        ordered = [done[f"{segment_index:04d}_{lang}"] for segment_index, lang, _ in items if f"{segment_index:04d}_{lang}" in done]
        set_artifact(db, task.id, "clip_manifest", ordered)
    return ordered


def _ensure_audio_and_subtitles(db: Session, task: ConversionTask, clips: list[dict], control: Callable[[], None]) -> AudioFile:
    existing_audio = db.query(AudioFile).filter(AudioFile.task_id == task.id).first()
    if existing_audio and Path(existing_audio.audio_path).exists():
        if task.custom_title and existing_audio.title != task.custom_title:
            existing_audio.title = task.custom_title
            db.commit()
            db.refresh(existing_audio)
        return existing_audio

    control()
    update_task(db, task, "running", TaskStage.MERGING_AUDIO, STAGE_PROGRESS[TaskStage.MERGING_AUDIO])
    audio_id = new_id("audio")
    out_dir = audio_dir(audio_id)
    cfg = get_settings(db)
    lang_pause = int(cfg.get("pause_between_languages_ms") or 500)
    seg_pause = int(cfg.get("pause_between_segments_ms") or 800)
    timeline_dir = ensure_dir(task_dir(task.id) / "timeline_wav")
    lang_silence = timeline_dir / f"silence_lang_{lang_pause}.wav"
    seg_silence = timeline_dir / f"silence_seg_{seg_pause}.wav"
    if not lang_silence.exists():
        silence_wav(lang_silence, lang_pause)
        control()
    if not seg_silence.exists():
        silence_wav(seg_silence, seg_pause)
        control()

    # Decode every merged input to a uniform PCM timeline first. Subtitle timestamps
    # are calculated from these exact WAV inputs, avoiding cumulative MP3 padding/
    # VBR duration drift on long audio.
    lang_dur = ffprobe_duration(lang_silence)
    seg_dur = ffprobe_duration(seg_silence)
    control()

    concat_files: list[Path] = []
    subtitle_entries = []
    current = 0.0
    for idx, clip in enumerate(clips):
        source_path = Path(clip["path"])
        clip_wav = timeline_dir / f"{clip['key']}.wav"
        if not clip_wav.exists() or clip_wav.stat().st_mtime < source_path.stat().st_mtime:
            convert_to_timeline_wav(source_path, clip_wav)
            control()
        clip_duration = ffprobe_duration(clip_wav)
        concat_files.append(clip_wav)
        start = current
        end = current + clip_duration
        subtitle_entries.append({"segment_index": clip["segment_index"], "lang": clip["lang"], "start": start, "end": end, "text": clip["text"]})
        current = end
        next_clip = clips[idx + 1] if idx + 1 < len(clips) else None
        if next_clip:
            silence = seg_silence if next_clip["segment_index"] != clip["segment_index"] else lang_silence
            concat_files.append(silence)
            current += seg_dur if next_clip["segment_index"] != clip["segment_index"] else lang_dur

    merged = task_dir(task.id) / "merged.wav"
    normalized = out_dir / "final.mp3"
    concat_wav(concat_files, merged)
    control()
    update_task(db, task, "running", TaskStage.NORMALIZING_AUDIO, STAGE_PROGRESS[TaskStage.NORMALIZING_AUDIO])
    normalize_audio(merged, normalized)
    control()
    duration = ffprobe_duration(normalized)
    update_task(db, task, "running", TaskStage.GENERATING_SUBTITLES, STAGE_PROGRESS[TaskStage.GENERATING_SUBTITLES])
    vtt, srt, json_path = write_subtitles(subtitle_entries, out_dir)
    control()

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
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{threading.get_ident()}"
    try:
        task = db.get(ConversionTask, task_id)
        if not task:
            return
        if task.status == "running" and not is_stale_running(task):
            return
        if task.status == "running" and is_stale_running(task):
            logger.warning("Taking over stale running task %s", task_id)
        if task.cancel_requested or task.status == "canceled":
            update_task(db, task, "canceled", TaskStage.CANCELED, task.progress or 0)
            return
        if task.status not in {"pending", "running"}:
            return
        task.worker_id = worker_id
        task.started_at = task.started_at or utcnow()
        task.heartbeat_at = utcnow()
        update_task(db, task, "running", task.stage or TaskStage.PENDING, task.progress or 0)

        def control() -> None:
            check_control(db, task)

        control()
        text = _ensure_text(db, task, control)
        update_task(db, task, "running", TaskStage.TEXT_READY, STAGE_PROGRESS[TaskStage.TEXT_READY])
        control()
        text = task.edited_text or get_artifact(db, task.id, "edited_text") or text
        segments = await _ensure_segments(db, task, text, control)
        update_task(db, task, "running", TaskStage.BILINGUAL_TEXT_READY, STAGE_PROGRESS[TaskStage.BILINGUAL_TEXT_READY])
        control()
        clips = await _ensure_clips(db, task, segments, control)
        update_task(db, task, "running", TaskStage.CLIPS_READY, STAGE_PROGRESS[TaskStage.CLIPS_READY])
        control()
        _ensure_audio_and_subtitles(db, task, clips, control)
        control()
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
