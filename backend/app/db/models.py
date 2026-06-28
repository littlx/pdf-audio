from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.utils import utcnow
from app.db.session import Base
from enum import Enum

class TaskStage(str, Enum):
    PENDING = "pending"
    EXTRACTING_TEXT = "extracting_text"
    TEXT_READY = "text_ready"
    GENERATING_BILINGUAL_TEXT = "generating_bilingual_text"
    BILINGUAL_TEXT_READY = "bilingual_text_ready"
    GENERATING_TTS_CLIPS = "generating_tts_clips"
    CLIPS_READY = "clips_ready"
    MERGING_AUDIO = "merging_audio"
    NORMALIZING_AUDIO = "normalizing_audio"
    GENERATING_SUBTITLES = "generating_subtitles"
    COMPLETED = "completed"
    CANCELED = "canceled"


STAGE_PROGRESS = {
    TaskStage.PENDING: 0,
    TaskStage.EXTRACTING_TEXT: 10,
    TaskStage.TEXT_READY: 25,
    TaskStage.GENERATING_BILINGUAL_TEXT: 30,
    TaskStage.BILINGUAL_TEXT_READY: 40,
    TaskStage.GENERATING_TTS_CLIPS: 45,
    TaskStage.CLIPS_READY: 72,
    TaskStage.MERGING_AUDIO: 75,
    TaskStage.NORMALIZING_AUDIO: 85,
    TaskStage.GENERATING_SUBTITLES: 92,
    TaskStage.COMPLETED: 100,
    TaskStage.CANCELED: 100,
}


class PdfFile(Base):
    __tablename__ = "pdf_files"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    original_name: Mapped[str] = mapped_column(String, nullable=False)
    file_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False)
    author: Mapped[str] = mapped_column(String, nullable=True)
    outline_json: Mapped[str] = mapped_column(Text, nullable=True)
    last_preview_page: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String, default="ready")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ConversionTask(Base):
    __tablename__ = "conversion_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    pdf_id: Mapped[str] = mapped_column(String, ForeignKey("pdf_files.id", ondelete="SET NULL"), nullable=True)
    source_pdf_name: Mapped[str] = mapped_column(String, nullable=True)
    input_type: Mapped[str] = mapped_column(String, nullable=False)
    page_expression: Mapped[str] = mapped_column(String, nullable=True)
    selected_text: Mapped[str] = mapped_column(Text, nullable=True)
    edited_text: Mapped[str] = mapped_column(Text, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=True)
    bilingual_format: Mapped[str] = mapped_column(String, default="sentence_pair")
    output_style: Mapped[str] = mapped_column(String, default="faithful")
    audio_mode: Mapped[str] = mapped_column(String, default="bilingual")
    ai_model: Mapped[str] = mapped_column(String, default="deepseek-v4-flash")
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    stage: Mapped[str] = mapped_column(String, default="pending")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    pause_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    rq_job_id: Mapped[str] = mapped_column(String, nullable=True)
    worker_id: Mapped[str] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    custom_title: Mapped[str] = mapped_column(String, nullable=True)
    extract_mode: Mapped[str] = mapped_column(String, default="auto")

    pdf: Mapped[PdfFile] = relationship()
    segments: Mapped[list["BilingualSegment"]] = relationship(cascade="all, delete-orphan")
    artifacts: Mapped[list["TaskArtifact"]] = relationship(cascade="all, delete-orphan")


class BilingualSegment(Base):
    __tablename__ = "bilingual_segments"
    __table_args__ = (UniqueConstraint("task_id", "segment_index", name="uq_bilingual_segments_task_index"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    task_id: Mapped[str] = mapped_column(String, ForeignKey("conversion_tasks.id", ondelete="CASCADE"), index=True)
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    english: Mapped[str] = mapped_column(Text, nullable=False)
    chinese: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AudioFile(Base):
    __tablename__ = "audio_files"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    task_id: Mapped[str] = mapped_column(String, ForeignKey("conversion_tasks.id", ondelete="SET NULL"), nullable=True)
    pdf_id: Mapped[str] = mapped_column(String, ForeignKey("pdf_files.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    source_pdf_name: Mapped[str] = mapped_column(String, nullable=True)
    page_expression: Mapped[str] = mapped_column(String, nullable=True)
    audio_mode: Mapped[str] = mapped_column(String, nullable=False)
    audio_path: Mapped[str] = mapped_column(String, nullable=False)
    subtitle_vtt_path: Mapped[str] = mapped_column(String, nullable=True)
    subtitle_srt_path: Mapped[str] = mapped_column(String, nullable=True)
    subtitle_json_path: Mapped[str] = mapped_column(String, nullable=True)
    duration: Mapped[float] = mapped_column(Float, nullable=True)
    format: Mapped[str] = mapped_column(String, default="mp3")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pdf: Mapped[PdfFile] = relationship()

    @property
    def source_pdf_name_computed(self) -> str | None:
        return self.pdf.original_name if self.pdf else self.source_pdf_name

    @property
    def audio_url(self) -> str:
        return f"/api/audios/{self.id}/file"

    @property
    def subtitle_json_url(self) -> str:
        return f"/api/audios/{self.id}/subtitles.json"

    @property
    def subtitle_vtt_url(self) -> str:
        return f"/api/audios/{self.id}/subtitles.vtt"

    @property
    def subtitle_srt_url(self) -> str:
        return f"/api/audios/{self.id}/subtitles.srt"


class PlaybackRecord(Base):
    __tablename__ = "playback_records"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    audio_id: Mapped[str] = mapped_column(String, ForeignKey("audio_files.id", ondelete="CASCADE"), unique=True)
    current_time: Mapped[float] = mapped_column(Float, default=0)
    playback_rate: Mapped[float] = mapped_column(Float, default=1)
    loop_current_segment: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AppSetting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class TaskArtifact(Base):
    __tablename__ = "task_artifacts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    task_id: Mapped[str] = mapped_column(String, ForeignKey("conversion_tasks.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
