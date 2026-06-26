from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.schemas import LastPageUpdate, SettingsUpdate, TaskCreate, PdfRename, AudioRename
from app.core.utils import safe_path_under


def test_safe_path_under_accepts_child(tmp_path: Path):
    base = tmp_path / "storage"
    child = base / "pdfs" / "file.pdf"
    child.parent.mkdir(parents=True)
    assert safe_path_under(child, base) == child.resolve(strict=False)


def test_safe_path_under_rejects_escape(tmp_path: Path):
    base = tmp_path / "storage"
    outside = tmp_path / "outside.pdf"
    with pytest.raises(HTTPException):
      safe_path_under(outside, base)


def test_last_page_update_validation():
    with pytest.raises(ValidationError):
        LastPageUpdate(page=0)


def test_task_create_requires_page_range_source():
    with pytest.raises(ValidationError):
        TaskCreate(input_type="page_range")


def test_task_create_requires_selected_text_min_length():
    with pytest.raises(ValidationError):
        TaskCreate(input_type="selected_text", selected_text="short")


def test_settings_update_validates_percent_fields():
    with pytest.raises(ValidationError):
        SettingsUpdate(english_rate="fast")


def test_pdf_rename_validation():
    with pytest.raises(ValidationError):
        PdfRename(original_name="")
    rename = PdfRename(original_name="new_name.pdf")
    assert rename.original_name == "new_name.pdf"


def test_audio_rename_validation():
    with pytest.raises(ValidationError):
        AudioRename(title="")
    rename = AudioRename(title="New Audio Name")
    assert rename.title == "New Audio Name"


