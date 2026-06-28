import type { AppSettings } from '../api/types';

export const defaultSettings: AppSettings = {
  ai_base_url: '',
  ai_model: '',
  default_bilingual_format: 'sentence_pair',
  default_output_style: 'faithful',
  english_voice: 'en-US-JennyNeural',
  chinese_voice: 'zh-CN-XiaoxiaoNeural',
  english_rate: '+0%',
  chinese_rate: '+0%',
  english_volume: '+0%',
  chinese_volume: '+0%',
  pause_between_languages_ms: 500,
  pause_between_segments_ms: 800,
  subtitle_font_size: 'medium',
  subtitle_color: 'default',
  dark_mode: false,
  audio_retention_days: undefined,
};

export const BILINGUAL_FORMAT_OPTIONS = [
  { value: 'sentence_pair', labelKey: 'sentencePair' },
  { value: 'paragraph_pair', labelKey: 'paragraphPair' },
] as const;

export const OUTPUT_STYLE_OPTIONS = [
  { value: 'faithful', labelKey: 'faithful' },
  { value: 'plain_explanation', labelKey: 'plainExplanation' },
  { value: 'child_friendly', labelKey: 'childFriendly' },
  { value: 'exam_english', labelKey: 'examEnglish' },
  { value: 'business_english', labelKey: 'businessEnglish' },
] as const;

export const AUDIO_MODE_OPTIONS = [
  { value: 'bilingual', labelKey: 'bilingual' },
  { value: 'english', labelKey: 'englishOnly' },
  { value: 'chinese', labelKey: 'chineseOnly' },
] as const;
