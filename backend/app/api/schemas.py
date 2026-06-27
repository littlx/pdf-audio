import re
from typing import Literal
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

RATE_VOLUME_PATTERN = re.compile(r"^[+-]?\d{1,3}%$")


class OkOut(BaseModel):
    ok: bool = True


class HealthOut(OkOut):
    pass


class PdfOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_name: str
    file_size: int
    page_count: int
    author: str | None = None
    last_preview_page: int
    status: str
    uploaded_at: datetime


class OutlineItem(BaseModel):
    level: int
    title: str
    page: int


class LastPageUpdate(BaseModel):
    page: int = Field(ge=1)


class TaskCreate(BaseModel):
    pdf_id: str | None = None
    input_type: Literal["page_range", "selected_text"]
    page_expression: str | None = Field(default=None, min_length=1, max_length=128)
    selected_text: str | None = Field(default=None, min_length=20, max_length=120_000)
    bilingual_format: Literal["sentence_pair", "paragraph_pair"] | None = None
    output_style: Literal["faithful", "plain_explanation", "child_friendly", "exam_english", "business_english"] | None = None
    audio_mode: Literal["bilingual", "english", "chinese"] = "bilingual"
    custom_title: str | None = Field(default=None, min_length=1, max_length=256)

    @field_validator("page_expression", "selected_text")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_source(self):
        if self.input_type == "page_range" and (not self.pdf_id or not self.page_expression):
            raise ValueError("page_range conversion requires pdf_id and page_expression")
        if self.input_type == "selected_text" and not self.selected_text:
            raise ValueError("selected_text conversion requires selected_text")
        return self


class TaskTextUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=120_000)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text is required")
        return value


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pdf_id: str | None
    source_pdf_name: str | None
    input_type: str
    page_expression: str | None
    bilingual_format: str
    output_style: str
    audio_mode: str
    status: str
    stage: str
    progress: int
    error_message: str | None


class TaskSegmentOut(BaseModel):
    index: int
    english: str
    chinese: str


class TaskDetailOut(TaskOut):
    segments: list[TaskSegmentOut] = []
    extracted_text: str | None = None


class AudioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str | None
    pdf_id: str | None = None
    title: str
    source_pdf_name: str | None = Field(default=None, validation_alias="source_pdf_name_computed")
    page_expression: str | None
    audio_mode: str
    duration: float | None
    created_at: datetime
    audio_url: str
    subtitle_json_url: str
    subtitle_vtt_url: str
    subtitle_srt_url: str


class PlaybackIn(BaseModel):
    current_time: float = Field(ge=0, le=86_400)
    playback_rate: float = Field(default=1, ge=0.25, le=4)
    loop_current_segment: bool = False


class PlaybackOut(PlaybackIn):
    pass


class SettingsOut(BaseModel):
    ai_base_url: str
    ai_model: str
    ai_api_key_configured: bool = False
    ai_api_key_masked: str | None = None
    default_bilingual_format: str
    default_output_style: str
    english_voice: str
    chinese_voice: str
    english_rate: str
    chinese_rate: str
    english_volume: str
    chinese_volume: str
    pause_between_languages_ms: int
    pause_between_segments_ms: int
    subtitle_font_size: str
    subtitle_color: str
    dark_mode: bool


class VoiceOut(BaseModel):
    name: str | None
    locale: str | None = None
    gender: str | None = None


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ai_base_url: str | None = Field(default=None, max_length=500)
    ai_api_key: str | None = Field(default=None, max_length=500)
    ai_model: str | None = Field(default=None, min_length=1, max_length=120)
    default_bilingual_format: Literal["sentence_pair", "paragraph_pair"] | None = None
    default_output_style: Literal["faithful", "plain_explanation", "child_friendly", "exam_english", "business_english"] | None = None
    english_voice: str | None = Field(default=None, min_length=1, max_length=128)
    chinese_voice: str | None = Field(default=None, min_length=1, max_length=128)
    english_rate: str | None = Field(default=None, max_length=8)
    chinese_rate: str | None = Field(default=None, max_length=8)
    english_volume: str | None = Field(default=None, max_length=8)
    chinese_volume: str | None = Field(default=None, max_length=8)
    pause_between_languages_ms: int | None = Field(default=None, ge=0, le=60_000)
    pause_between_segments_ms: int | None = Field(default=None, ge=0, le=60_000)
    subtitle_font_size: Literal["small", "medium", "large"] | None = None
    subtitle_color: str | None = Field(default=None, max_length=64)
    dark_mode: bool | None = None

    @field_validator("english_rate", "chinese_rate", "english_volume", "chinese_volume")
    @classmethod
    def validate_percent(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not RATE_VOLUME_PATTERN.match(value):
            raise ValueError("TTS rate and volume must be signed percentages, e.g. +0%")
        return value


class TtsPreviewRequest(BaseModel):
    lang: Literal["english", "chinese"] = "english"
    voice: str | None = Field(default=None, max_length=128)
    text: str | None = Field(default=None, max_length=1_000)


class PdfRename(BaseModel):
    original_name: str = Field(min_length=1, max_length=255)


class AudioRename(BaseModel):
    title: str = Field(min_length=1, max_length=255)


