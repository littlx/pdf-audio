from pydantic import BaseModel, Field


class PdfOut(BaseModel):
    id: str
    original_name: str
    file_size: int
    page_count: int
    author: str | None = None
    last_preview_page: int
    status: str
    uploaded_at: str


class TaskCreate(BaseModel):
    pdf_id: str | None = None
    input_type: str = Field(pattern="^(page_range|selected_text)$")
    page_expression: str | None = None
    selected_text: str | None = None
    bilingual_format: str | None = Field(default=None, pattern="^(sentence_pair|paragraph_pair)$")
    output_style: str | None = None
    audio_mode: str | None = Field(default="bilingual", pattern="^(bilingual|english|chinese)$")


class TaskOut(BaseModel):
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


class AudioOut(BaseModel):
    id: str
    task_id: str | None
    title: str
    source_pdf_name: str | None
    page_expression: str | None
    audio_mode: str
    duration: float | None
    created_at: str


class PlaybackIn(BaseModel):
    current_time: float
    playback_rate: float = 1
    loop_current_segment: bool = False
