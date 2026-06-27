import json
from pathlib import Path
from typing import Literal

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.schemas import LastPageUpdate, OkOut, OutlineItem, PdfExtractAiRequest, PdfExtractOut, PdfExtractRequest, PdfOut, PdfRename
from app.core.config import settings
from app.core.security import require_access_token
from app.core.utils import safe_path_under
from app.db.models import PdfFile
from app.db.session import get_db
from app.services.pdf_service import delete_pdf_file, save_uploaded_pdf
from app.services.text_extraction import extract_text_from_pdf

router = APIRouter(prefix="/api/pdfs", tags=["pdfs"], dependencies=[Depends(require_access_token)])


def get_pdf_or_404(db: Session, pdf_id: str) -> PdfFile:
    pdf = db.get(PdfFile, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return pdf


@router.post("", response_model=PdfOut)
async def upload_pdf(file: UploadFile, db: Session = Depends(get_db)):
    pdf = await save_uploaded_pdf(db, file)
    return pdf


@router.get("", response_model=list[PdfOut])
def list_pdfs(
    keyword: str = Query(default="", max_length=200),
    sort: Literal["uploaded_at", "author", "original_name", "file_size"] = "uploaded_at",
    db: Session = Depends(get_db)
):
    query = db.query(PdfFile)
    if keyword:
        query = query.filter(PdfFile.original_name.ilike(f"%{keyword}%"))
    if sort == "author":
        query = query.order_by(PdfFile.author.asc().nullslast())
    elif sort == "original_name":
        query = query.order_by(PdfFile.original_name.asc())
    elif sort == "file_size":
        query = query.order_by(PdfFile.file_size.desc())
    else:
        query = query.order_by(PdfFile.uploaded_at.desc())
    return query.all()


@router.get("/{pdf_id}", response_model=PdfOut)
def get_pdf(pdf_id: str, db: Session = Depends(get_db)):
    return get_pdf_or_404(db, pdf_id)


@router.delete("/{pdf_id}", response_model=OkOut)
def delete_pdf(pdf_id: str, db: Session = Depends(get_db)):
    delete_pdf_file(db, pdf_id)
    return {"ok": True}


@router.get("/{pdf_id}/file")
def get_pdf_file(pdf_id: str, db: Session = Depends(get_db)):
    pdf = get_pdf_or_404(db, pdf_id)
    path = safe_path_under(pdf.file_path, Path(settings.storage_dir) / "pdfs" / pdf_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    encoded_name = quote(pdf.original_name)
    headers = {"Content-Disposition": f"inline; filename*=UTF-8''{encoded_name}"}
    return FileResponse(path, media_type="application/pdf", headers=headers)


@router.get("/{pdf_id}/outline", response_model=list[OutlineItem])
def get_outline(pdf_id: str, db: Session = Depends(get_db)):
    pdf = get_pdf_or_404(db, pdf_id)
    return json.loads(pdf.outline_json or "[]")


@router.patch("/{pdf_id}/last-page", response_model=PdfOut)
def update_last_page(pdf_id: str, payload: LastPageUpdate, db: Session = Depends(get_db)):
    pdf = get_pdf_or_404(db, pdf_id)
    pdf.last_preview_page = max(1, min(payload.page, pdf.page_count))
    db.commit()
    return pdf


@router.patch("/{pdf_id}/rename", response_model=PdfOut)
def rename_pdf(pdf_id: str, payload: PdfRename, db: Session = Depends(get_db)):
    pdf = get_pdf_or_404(db, pdf_id)
    name = payload.original_name.strip()
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    pdf.original_name = name
    db.commit()
    return pdf


@router.post("/{pdf_id}/extract", response_model=PdfExtractOut)
def extract_pdf_pages_text(pdf_id: str, payload: PdfExtractRequest, db: Session = Depends(get_db)):
    pdf = get_pdf_or_404(db, pdf_id)
    text, _ = extract_text_from_pdf(pdf.file_path, payload.page_expression, pdf.page_count)
    return {"text": text}


@router.post("/{pdf_id}/extract-ai", response_model=PdfExtractOut)
async def extract_pdf_pages_text_ai(pdf_id: str, payload: PdfExtractAiRequest, db: Session = Depends(get_db)):
    from app.services.text_extraction import extract_text_from_pdf_via_ai

    pdf = get_pdf_or_404(db, pdf_id)
    text, _ = await extract_text_from_pdf_via_ai(
        db, pdf.file_path, payload.page_expression, pdf.page_count, payload.prompt
    )
    return {"text": text}
