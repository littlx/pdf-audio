import type { Task } from '../api/types';

export type TaskControlAction = 'pause' | 'cancel' | 'resume' | 'retry';
export type StageStep = { label: string; desc: string };

export const TASK_TERMINAL_STATUSES = ['completed', 'failed', 'canceled'] as const;
export const TASK_ACTIVE_STATUSES = ['pending', 'running', 'canceling'] as const;

export function isTerminalTaskStatus(status: string) {
  return TASK_TERMINAL_STATUSES.includes(status as (typeof TASK_TERMINAL_STATUSES)[number]);
}

export function isActiveTaskStatus(status: string) {
  return TASK_ACTIVE_STATUSES.includes(status as (typeof TASK_ACTIVE_STATUSES)[number]);
}

export function canPause(status: string) {
  return ['pending', 'running'].includes(status);
}

export function canCancel(status: string) {
  return !isTerminalTaskStatus(status);
}

export function canResume(status: string) {
  return status === 'paused';
}

export function canRetry(status: string) {
  return ['failed', 'paused', 'canceled'].includes(status);
}

export function canControlTask(status: string, action: TaskControlAction) {
  if (action === 'pause') return canPause(status);
  if (action === 'cancel') return canCancel(status);
  if (action === 'resume') return canResume(status);
  return canRetry(status);
}

export function getTaskStepIndex(stage: string): number {
  switch (stage) {
    case 'pending':
    case 'extracting_text':
    case 'text_ready':
      return 0;
    case 'generating_bilingual_text':
    case 'bilingual_text_ready':
      return 1;
    case 'generating_tts_clips':
    case 'clips_ready':
      return 2;
    case 'merging_audio':
    case 'normalizing_audio':
      return 3;
    case 'generating_subtitles':
      return 4;
    case 'completed':
      return 5;
    default:
      return 0;
  }
}

export function getStageLabel(stage: string, lang: string): string {
  switch (stage) {
    case 'pending':
      return lang === 'zh' ? '排队中' : 'Queueing';
    case 'extracting_text':
      return lang === 'zh' ? '提取文本' : 'Extracting text';
    case 'text_ready':
      return lang === 'zh' ? '文本就绪' : 'Text ready';
    case 'generating_bilingual_text':
      return lang === 'zh' ? 'AI 翻译对齐' : 'Translating';
    case 'bilingual_text_ready':
      return lang === 'zh' ? '双语就绪' : 'Bilingual ready';
    case 'generating_tts_clips':
      return lang === 'zh' ? '分句朗读合成' : 'TTS synthesis';
    case 'clips_ready':
      return lang === 'zh' ? '分句音频就绪' : 'Audio clips ready';
    case 'merging_audio':
      return lang === 'zh' ? '拼接音频' : 'Merging audio';
    case 'normalizing_audio':
      return lang === 'zh' ? '音质优化' : 'Normalizing audio';
    case 'generating_subtitles':
      return lang === 'zh' ? '生成双语字幕' : 'Generating subtitles';
    case 'completed':
      return lang === 'zh' ? '已完成' : 'Completed';
    case 'canceled':
      return lang === 'zh' ? '已取消' : 'Canceled';
    default:
      return stage;
  }
}

export function getTaskTimelineSteps(lang: string): StageStep[] {
  return lang === 'zh'
    ? [
        { label: '提取 PDF 文本', desc: '从 PDF 或选区中解析原始内容' },
        { label: 'AI 双语对齐与翻译', desc: '利用大模型生成精准中英对照' },
        { label: '分句语音合成', desc: '生成高品质双语朗读音频切片' },
        { label: '音频合成与正规化', desc: '拼接音频并优化电平与降噪' },
        { label: '生成同步双语字幕', desc: '生成与音频同步的播放器字幕' },
      ]
    : [
        { label: 'Extract PDF Text', desc: 'Parsing original content from PDF' },
        { label: 'AI Bilingual Translation', desc: 'Generating translation and alignment' },
        { label: 'Sentence Voice Synthesis', desc: 'Generating read-aloud audio clips' },
        { label: 'Audio Merging & Normalizing', desc: 'Merging audio and optimizing volume' },
        { label: 'Generate Synced Subtitles', desc: 'Rendering synced player subtitles' },
      ];
}

export function mergeTask(prev: Task | null, incoming: Task): Task {
  if (!prev || prev.id !== incoming.id) return incoming;
  return {
    ...prev,
    ...incoming,
    segments: incoming.segments?.length ? incoming.segments : prev.segments,
    extracted_text: incoming.extracted_text || prev.extracted_text,
  };
}

export function translateAudioMode(mode: string, t: (key: any) => string): string {
  if (mode === 'bilingual') return t('bilingual');
  if (mode === 'english') return t('englishOnly');
  if (mode === 'chinese') return t('chineseOnly');
  return mode;
}
