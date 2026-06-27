from pathlib import Path
import shutil
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.session import Base
from app.db.models import PdfFile, ConversionTask, AudioFile
from app.services.pdf_service import delete_pdf_file


def test_delete_pdf_cleans_orphans(tmp_path: Path, monkeypatch):
    # Setup storage dir and test DB
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Create directories and files
        pdf_dir = tmp_path / "pdfs" / "pdf_123"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        pdf_file = pdf_dir / "original.pdf"
        pdf_file.write_bytes(b"pdf content")
        
        task_dir = tmp_path / "tasks" / "task_456"
        task_dir.mkdir(parents=True, exist_ok=True)
        (task_dir / "manifest.json").write_bytes(b"{}")
        
        audio_dir = tmp_path / "audios" / "audio_789"
        audio_dir.mkdir(parents=True, exist_ok=True)
        (audio_dir / "final.mp3").write_bytes(b"mp3 content")
        
        # Populate DB rows
        pdf = PdfFile(
            id="pdf_123",
            original_name="original.pdf",
            file_hash="hash123",
            file_path=str(pdf_file),
            file_size=11,
            page_count=2,
            status="ready"
        )
        db.add(pdf)
        
        task = ConversionTask(
            id="task_456",
            pdf_id="pdf_123",
            input_type="page_range",
            status="completed",
            stage="completed"
        )
        db.add(task)
        
        audio = AudioFile(
            id="audio_789",
            task_id="task_456",
            pdf_id="pdf_123",
            title="Audio title",
            audio_mode="bilingual",
            audio_path=str(audio_dir / "final.mp3"),
            format="mp3"
        )
        db.add(audio)
        db.commit()
        
        # Verify initial state on disk
        assert pdf_file.exists()
        assert task_dir.exists()
        assert audio_dir.exists()
        
        # Verify initial state in DB
        assert db.get(PdfFile, "pdf_123") is not None
        assert db.get(ConversionTask, "task_456") is not None
        assert db.get(AudioFile, "audio_789") is not None
        
        # Call delete_pdf_file
        delete_pdf_file(db, "pdf_123")
        
        # Assert DB rows are deleted
        assert db.get(PdfFile, "pdf_123") is None
        assert db.get(ConversionTask, "task_456") is None
        assert db.get(AudioFile, "audio_789") is None
        
        # Assert disk files and directories are deleted
        assert not pdf_dir.exists()
        assert not task_dir.exists()
        assert not audio_dir.exists()
        
    finally:
        db.close()
