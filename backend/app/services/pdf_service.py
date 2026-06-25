import hashlib
import json
import shutil
from pathlib import Path

import fitz
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.utils import ensure_dir, new_id
from app.db.models import PdfFile


def pdf_storage_dir(pdf_id: str) -> Path:
    return ensure_dir(Path(settings.storage_dir) / "pdfs" / pdf_id)


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def outline_to_json(doc: fitz.Document) -> str:
    toc = doc.get_toc(simple=False)
    items = []
    for entry in toc:
        level, title, page, *_ = entry
        items.append({"level": level, "title": title, "page": page})
    return json.dumps(items, ensure_ascii=False)


def inspect_pdf(path: Path) -> tuple[int, str | None, str]:
    try:
        doc = fitz.open(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot open PDF: {exc}") from exc
    if doc.needs_pass:
        doc.close()
        raise HTTPException(status_code=400, detail="Encrypted PDFs are not supported")
    page_count = doc.page_count
    metadata = doc.metadata or {}
    author = metadata.get("author") or None
    outline = outline_to_json(doc)
    doc.close()
    return page_count, author, outline


async def save_uploaded_pdf(db: Session, file: UploadFile) -> PdfFile:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    tmp_dir = ensure_dir(Path(settings.storage_dir) / "tmp")
    tmp_path = tmp_dir / f"upload_{new_id('tmp')}.pdf"
    max_bytes = settings.max_pdf_size_mb * 1024 * 1024
    size = 0
    with tmp_path.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                tmp_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"PDF exceeds {settings.max_pdf_size_mb} MB")
            out.write(chunk)

    file_hash = hash_file(tmp_path)
    existing = db.query(PdfFile).filter(PdfFile.file_hash == file_hash).first()
    if existing:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail="This PDF has already been uploaded")

    page_count, author, outline = inspect_pdf(tmp_path)
    pdf_id = new_id("pdf")
    target_dir = pdf_storage_dir(pdf_id)
    target_path = target_dir / "original.pdf"
    shutil.move(str(tmp_path), target_path)

    pdf = PdfFile(
        id=pdf_id,
        original_name=file.filename,
        file_hash=file_hash,
        file_path=str(target_path),
        file_size=size,
        page_count=page_count,
        author=author,
        outline_json=outline,
        status="ready",
    )
    db.add(pdf)
    db.commit()
    db.refresh(pdf)
    return pdf


def delete_pdf_file(db: Session, pdf_id: str) -> None:
    pdf = db.get(PdfFile, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    path = Path(pdf.file_path)
    parent = path.parent
    path.unlink(missing_ok=True)
    try:
        if parent.name == pdf_id:
            shutil.rmtree(parent, ignore_errors=True)
    finally:
        db.delete(pdf)
        db.commit()
