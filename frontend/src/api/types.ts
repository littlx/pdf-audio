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
  custom_title?: string;
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

export type AppSettings = {
  ai_base_url: string;
  ai_model: string;
  ai_api_key_configured?: boolean;
  ai_api_key_masked?: string;
  default_bilingual_format: 'sentence_pair' | 'paragraph_pair';
  default_output_style: 'faithful' | 'plain_explanation' | 'child_friendly' | 'exam_english' | 'business_english';
  english_voice: string;
  chinese_voice: string;
  english_rate: string;
  chinese_rate: string;
  english_volume: string;
  chinese_volume: string;
  pause_between_languages_ms: number;
  pause_between_segments_ms: number;
  subtitle_font_size: 'small' | 'medium' | 'large';
  subtitle_color: string;
  dark_mode: boolean;
  audio_retention_days?: number;
};

export type SettingsUpdatePayload = Partial<Omit<AppSettings, 'ai_api_key_configured' | 'ai_api_key_masked'>> & {
  ai_api_key?: string;
};

export type TtsVoice = {
  name: string;
  locale?: string;
  gender?: string;
};
