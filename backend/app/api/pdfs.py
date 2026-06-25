import json
from pathlib import Path

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import require_access_token
from app.db.models import PdfFile
from app.db.session import get_db
from app.services.pdf_service import delete_pdf_file, save_uploaded_pdf

router = APIRouter(prefix="/api/pdfs", tags=["pdfs"], dependencies=[Depends(require_access_token)])


def serialize_pdf(pdf: PdfFile) -> dict:
    return {
        "id": pdf.id,
        "original_name": pdf.original_name,
        "file_size": pdf.file_size,
        "page_count": pdf.page_count,
        "author": pdf.author,
        "last_preview_page": pdf.last_preview_page,
        "status": pdf.status,
        "uploaded_at": pdf.uploaded_at.isoformat(),
    }


@router.post("")
async def upload_pdf(file: UploadFile, db: Session = Depends(get_db)):
    pdf = await save_uploaded_pdf(db, file)
    return serialize_pdf(pdf)


@router.get("")
def list_pdfs(keyword: str = "", sort: str = "uploaded_at", db: Session = Depends(get_db)):
    query = db.query(PdfFile)
    if keyword:
        query = query.filter(PdfFile.original_name.ilike(f"%{keyword}%"))
    if sort == "author":
        query = query.order_by(PdfFile.author.asc().nullslast())
    else:
        query = query.order_by(PdfFile.uploaded_at.desc())
    return [serialize_pdf(pdf) for pdf in query.all()]


@router.get("/{pdf_id}")
def get_pdf(pdf_id: str, db: Session = Depends(get_db)):
    pdf = db.get(PdfFile, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return serialize_pdf(pdf)


@router.delete("/{pdf_id}")
def delete_pdf(pdf_id: str, db: Session = Depends(get_db)):
    delete_pdf_file(db, pdf_id)
    return {"ok": True}


@router.get("/{pdf_id}/file")
def get_pdf_file(pdf_id: str, db: Session = Depends(get_db)):
    pdf = db.get(PdfFile, pdf_id)
    if not pdf or not Path(pdf.file_path).exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    encoded_name = quote(pdf.original_name)
    headers = {"Content-Disposition": f"inline; filename*=UTF-8''{encoded_name}"}
    return FileResponse(pdf.file_path, media_type="application/pdf", headers=headers)


@router.get("/{pdf_id}/outline")
def get_outline(pdf_id: str, db: Session = Depends(get_db)):
    pdf = db.get(PdfFile, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return json.loads(pdf.outline_json or "[]")


@router.patch("/{pdf_id}/last-page")
def update_last_page(pdf_id: str, payload: dict, db: Session = Depends(get_db)):
    pdf = db.get(PdfFile, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    page = int(payload.get("page", 1))
    pdf.last_preview_page = max(1, min(page, pdf.page_count))
    db.commit()
    return serialize_pdf(pdf)
