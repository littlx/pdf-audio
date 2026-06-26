from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.session import Base
from app.services.pdf_service import save_uploaded_pdf


@pytest.mark.anyio("asyncio")
async def test_reject_non_pdf_without_tmp_residue(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    source = tmp_path / "not_pdf.txt"
    source.write_bytes(b"not a pdf")
    try:
        with source.open("rb") as handle:
            upload = UploadFile(file=handle, filename="not_pdf.txt")
            with pytest.raises(HTTPException) as exc:
                await save_uploaded_pdf(db, upload)
        assert exc.value.status_code == 400
        tmp_dir = tmp_path / "tmp"
        assert not tmp_dir.exists() or list(tmp_dir.iterdir()) == []
    finally:
        db.close()
