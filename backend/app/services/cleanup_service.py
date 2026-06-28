import logging
import shutil
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.utils import ensure_dir, safe_path_under, utcnow
from app.db.models import AudioFile, ConversionTask
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


def clean_cache_and_tmp() -> None:
    """Clean cache and tmp directories of files older than 2 hours."""
    now = time.time()
    max_age_seconds = 7200
    for folder in ["cache", "tmp"]:
        directory = Path(settings.storage_dir) / folder
        if not directory.exists():
            continue
        for item in directory.glob("**/*"):
            try:
                if item.is_file() or item.is_symlink():
                    if now - item.stat().st_mtime > max_age_seconds:
                        item.unlink()
            except Exception:
                pass
        
        # Clean empty subdirectories in cache/tmp
        for item in directory.glob("**/"):
            if item == directory:
                continue
            try:
                if item.is_dir() and not any(item.iterdir()):
                    item.rmdir()
            except Exception:
                pass


def cleanup_expired_records(db: Session, max_age_days: int = 14) -> int:
    """Delete audio files and their conversion tasks older than max_age_days."""
    limit_date = utcnow() - timedelta(days=max_age_days)
    
    # Find expired audio files
    expired_audios = db.query(AudioFile).filter(AudioFile.created_at < limit_date).all()
    count = 0
    
    for audio in expired_audios:
        try:
            # Delete physical audio and subtitles files
            audio_dir = safe_path_under(
                Path(settings.storage_dir) / "audios" / audio.id,
                Path(settings.storage_dir) / "audios"
            )
            if audio_dir.exists():
                shutil.rmtree(audio_dir, ignore_errors=True)
                
            # If there is a task, delete the task directory as well
            if audio.task_id:
                task_dir = safe_path_under(
                    Path(settings.storage_dir) / "tasks" / audio.task_id,
                    Path(settings.storage_dir) / "tasks"
                )
                if task_dir.exists():
                    shutil.rmtree(task_dir, ignore_errors=True)
                
                # Delete task from database (will cascade delete segments and artifacts)
                task = db.get(ConversionTask, audio.task_id)
                if task:
                    db.delete(task)
                    
            db.delete(audio)
            count += 1
        except Exception:
            logger.exception("Failed to clean up expired audio record: %s", audio.id)
            
    if count > 0:
        db.commit()
        logger.info("Cleaned up %d expired audio files older than %d days.", count, max_age_days)
        
    return count


def run_periodic_cleanup(stop_event: threading.Event, interval_hours: float = 12.0) -> None:
    """Background loop that runs periodic cleanup checks."""
    logger.info("Starting background storage cleanup service...")
    
    # Wait a bit after startup before the first run to not interfere with startup
    initial_wait = 15
    for _ in range(initial_wait):
        if stop_event.is_set():
            return
        time.sleep(1)
        
    while not stop_event.is_set():
        logger.info("Executing scheduled storage cleanup...")
        try:
            clean_cache_and_tmp()
            
            retention_days = settings.audio_retention_days
            if retention_days and retention_days > 0:
                db = SessionLocal()
                try:
                    cleanup_expired_records(db, max_age_days=retention_days)
                finally:
                    db.close()
            else:
                logger.info("Auto audio deletion is disabled (AUDIO_RETENTION_DAYS is not set or <= 0).")
        except Exception:
            logger.exception("Error occurred during background storage cleanup")
            
        # Sleep in small increments checking stop_event so thread shuts down quickly
        sleep_seconds = int(interval_hours * 3600)
        for _ in range(sleep_seconds):
            if stop_event.is_set():
                break
            time.sleep(1)
            
    logger.info("Background storage cleanup service stopped.")
