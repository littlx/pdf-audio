import hashlib
import shutil
from pathlib import Path

import fitz
from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.utils import ensure_dir, new_id, safe_path_under, utcnow
from app.db.models import PdfFile

ACTIVE_TASK_STATUSES = {"pending", "running", "canceling"}


def pdf_storage_dir(pdf_id: str) -> Path:
    return ensure_dir(Path(settings.storage_dir) / "pdfs" / pdf_id)


def calculate_hash(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def inspect_pdf(path: Path) -> tuple[int, str | None, str]:
    doc = fitz.open(path)
    try:
        if doc.needs_pass:
            raise HTTPException(status_code=400, detail="Encrypted PDFs are not supported")
        page_count = doc.page_count
        metadata = doc.metadata or {}
        author = metadata.get("author") or None
        outline = []
        try:
            toc = doc.get_toc(simple=True)
            outline = [{"level": item[0], "title": item[1], "page": item[2]} for item in toc]
        except Exception:
            outline = []
        return page_count, author, __import__("json").dumps(outline, ensure_ascii=False)
    finally:
        doc.close()


async def save_uploaded_pdf(db: Session, file: UploadFile) -> PdfFile:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    max_bytes = settings.max_pdf_size_mb * 1024 * 1024
    tmp_dir = ensure_dir(Path(settings.storage_dir) / "tmp")
    tmp_path = tmp_dir / f"{new_id('upload')}.pdf"
    total = 0
    try:
        with tmp_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="PDF is too large")
                out.write(chunk)

        file_hash = calculate_hash(tmp_path)
        existing = db.query(PdfFile).filter(PdfFile.file_hash == file_hash).first()
        if existing:
            raise HTTPException(status_code=409, detail="This PDF has already been uploaded")

        page_count, author, outline = inspect_pdf(tmp_path)
        if page_count < 1:
            raise HTTPException(status_code=400, detail="PDF has no pages")

        pdf_id = new_id("pdf")
        target_dir = pdf_storage_dir(pdf_id)
        target = target_dir / "source.pdf"
        shutil.move(str(tmp_path), target)

        pdf = PdfFile(
            id=pdf_id,
            original_name=file.filename,
            file_hash=file_hash,
            file_path=str(target),
            file_size=target.stat().st_size,
            page_count=page_count,
            author=author,
            outline_json=outline,
            status="ready",
        )
        db.add(pdf)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="This PDF has already been uploaded") from exc
        except Exception:
            db.rollback()
            raise
        db.refresh(pdf)
        return pdf
    except Exception:
        if 'target_dir' in locals():
            shutil.rmtree(target_dir, ignore_errors=True)
        raise
    finally:
        tmp_path.unlink(missing_ok=True)


def delete_pdf_file(db: Session, pdf_id: str) -> None:
    pdf = db.get(PdfFile, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    
    from app.db.models import AudioFile, ConversionTask

    active_task = db.query(ConversionTask).filter(
        ConversionTask.pdf_id == pdf_id,
        ConversionTask.status.in_(list(ACTIVE_TASK_STATUSES)),
    ).first()
    if active_task:
        raise HTTPException(status_code=409, detail="Cancel associated tasks and wait for them to stop before deleting this PDF")

    # 1. Clean up associated audio files (disk + DB)
    audios = db.query(AudioFile).filter(AudioFile.pdf_id == pdf_id).all()
    for audio in audios:
        audio_dir = safe_path_under(Path(settings.storage_dir) / "audios" / audio.id, Path(settings.storage_dir) / "audios")
        shutil.rmtree(audio_dir, ignore_errors=True)
        db.delete(audio)

    # 2. Clean up associated conversion tasks (disk + DB)
    tasks = db.query(ConversionTask).filter(ConversionTask.pdf_id == pdf_id).all()
    for task in tasks:
        task_dir = safe_path_under(Path(settings.storage_dir) / "tasks" / task.id, Path(settings.storage_dir) / "tasks")
        shutil.rmtree(task_dir, ignore_errors=True)
        db.delete(task)

    # 3. Clean up the PDF file itself
    expected_dir = safe_path_under(Path(settings.storage_dir) / "pdfs" / pdf_id, Path(settings.storage_dir) / "pdfs")
    path = safe_path_under(pdf.file_path, expected_dir)
    path.unlink(missing_ok=True)
    shutil.rmtree(expected_dir, ignore_errors=True)

    db.delete(pdf)
    db.commit()
