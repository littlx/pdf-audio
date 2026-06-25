export type PdfFile = {
  id: string;
  original_name: string;
  file_size: number;
  page_count: number;
  author?: string;
  last_preview_page: number;
  status: string;
  uploaded_at: string;
};

export type Task = {
  id: string;
  pdf_id?: string;
  source_pdf_name?: string;
  input_type: string;
  page_expression?: string;
  bilingual_format: string;
  output_style: string;
  audio_mode: string;
  status: string;
  stage: string;
  progress: number;
  error_message?: string;
  extracted_text?: string;
  segments?: { index: number; english: string; chinese: string }[];
};

export type AudioFile = {
  id: string;
  task_id?: string;
  title: string;
  source_pdf_name?: string;
  page_expression?: string;
  audio_mode: string;
  duration?: number;
  created_at: string;
  audio_url: string;
  subtitle_json_url: string;
  subtitle_vtt_url: string;
  subtitle_srt_url: string;
};

export type SubtitleEntry = {
  segment_index: number;
  lang: 'english' | 'chinese';
  start: number;
  end: number;
  text: string;
};
