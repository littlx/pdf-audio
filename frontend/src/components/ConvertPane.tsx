import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, XCircle, RotateCcw, FileText, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings, AudioFile, PdfFile, Task } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';

const defaultSettings = {
  default_bilingual_format: 'sentence_pair',
  default_output_style: 'faithful',
} as const;

type InputMode = 'pages' | 'text';

type ConvertPaneProps = {
  pdf?: PdfFile;
  initialText?: string;
  onConversionComplete?: (audio: AudioFile) => void;
  onJumpToPdfPage?: (pageNum: number) => void;
};

function canPause(status: string) {
  return ['pending', 'running'].includes(status);
}
function canCancel(status: string) {
  return !['completed', 'failed', 'canceled'].includes(status);
}
function canResume(status: string) {
  return status === 'paused';
}
function canRetry(status: string) {
  return ['failed', 'paused', 'canceled'].includes(status);
}

function getStepIndex(stage: string): number {
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

const mergeTask = (prev: Task | null, incoming: Task): Task => {
  if (!prev || prev.id !== incoming.id) return incoming;
  return {
    ...prev,
    ...incoming,
    segments: incoming.segments?.length ? incoming.segments : prev.segments,
    extracted_text: incoming.extracted_text || prev.extracted_text,
  };
};

export default function ConvertPane({ pdf, initialText = '', onConversionComplete, onJumpToPdfPage }: ConvertPaneProps) {
  const { t, lang } = useT();
  const { toast } = useToast();

  const [pageExpression, setPageExpression] = useState('1');
  const [format, setFormat] = useState<AppSettings['default_bilingual_format']>(defaultSettings.default_bilingual_format);
  const [style, setStyle] = useState<AppSettings['default_output_style']>(defaultSettings.default_output_style);
  const [audioMode, setAudioMode] = useState('bilingual');
  const [task, setTask] = useState<Task | null>(null);
  const [editableText, setEditableText] = useState(initialText);
  const [textToConvert, setTextToConvert] = useState(initialText);
  const [mode, setMode] = useState<InputMode>(initialText ? 'text' : 'pages');
  const [error, setError] = useState('');
  const [completedAudio, setCompletedAudio] = useState<AudioFile | null>(null);
  const [showSegments, setShowSegments] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const notifiedTaskId = useRef<string | null>(null);

  const steps = lang === 'zh' ? [
    { label: '提取 PDF 文本', desc: '从 PDF 或选区中解析原始内容' },
    { label: 'AI 双语对齐与翻译', desc: '利用大模型生成精准中英对照' },
    { label: '分句语音合成', desc: '生成高品质双语朗读音频切片' },
    { label: '音频合成与正规化', desc: '拼接音频并优化电平与降噪' },
    { label: '生成同步双语字幕', desc: '生成与音频同步的播放器字幕' }
  ] : [
    { label: 'Extract PDF Text', desc: 'Parsing original content from PDF' },
    { label: 'AI Bilingual Translation', desc: 'Generating translation and alignment' },
    { label: 'Sentence Voice Synthesis', desc: 'Generating read-aloud audio clips' },
    { label: 'Audio Merging & Normalizing', desc: 'Merging audio and optimizing volume' },
    { label: 'Generate Synced Subtitles', desc: 'Rendering synced player subtitles' }
  ];

  const stepIndex = task ? getStepIndex(task.stage || 'pending') : 0;

  // Sync initialText if it changes from parent
  useEffect(() => {
    if (initialText) {
      setTextToConvert(initialText);
      setEditableText(initialText);
      setMode('text');
    }
  }, [initialText]);

  // Load defaults from AppSettings
  useEffect(() => {
    api<AppSettings>('/api/settings')
      .then((settings) => {
        setFormat(settings.default_bilingual_format || defaultSettings.default_bilingual_format);
        setStyle(settings.default_output_style || defaultSettings.default_output_style);
      })
      .catch(() => undefined);
  }, []);

  async function findCompletedAudio(currentTask: Task) {
    if (currentTask.status !== 'completed') return;
    if (notifiedTaskId.current === currentTask.id) return;
    try {
      const list = await api<AudioFile[]>('/api/audios');
      const audio = list.find((item) => item.task_id === currentTask.id) || null;
      if (audio) {
        notifiedTaskId.current = currentTask.id;
        setCompletedAudio(audio);
        if (onConversionComplete) {
          onConversionComplete(audio);
        }
      }
    } catch (err) {
      console.error('findCompletedAudio failed:', err);
    }
  }

  async function createTask() {
    setError('');
    setCompletedAudio(null);
    notifiedTaskId.current = null;
    if (mode === 'pages' && !pdf) {
      return setError(t('uploadFirstError'));
    }
    if (mode === 'text' && textToConvert.trim().length < 20) {
      return setError(t('textLengthError'));
    }

    const payload = mode === 'text'
      ? { pdf_id: pdf?.id, input_type: 'selected_text', selected_text: textToConvert, bilingual_format: format, output_style: style, audio_mode: audioMode, custom_title: customTitle.trim() || undefined }
      : { pdf_id: pdf!.id, input_type: 'page_range', page_expression: pageExpression, bilingual_format: format, output_style: style, audio_mode: audioMode, custom_title: customTitle.trim() || undefined };

    try {
      const created = await api<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      setTask(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createTaskFailed'));
    }
  }

  // Synchronize text updates and trigger audio completion callbacks when task changes
  useEffect(() => {
    if (!task) return;
    if (task.extracted_text) {
      setEditableText(prev => prev === task.extracted_text ? prev : task.extracted_text || '');
    }
    if (task.status === 'completed') {
      findCompletedAudio(task).catch(() => undefined);
    }
  }, [task]);

  // SSE and Polling fallback for task tracking
  useEffect(() => {
    if (!task) return;
    
    // If the task is already in a terminal state, don't start listening or polling
    if (['completed', 'failed', 'canceled'].includes(task.status)) {
      return;
    }

    let timer: any = null;
    let isCleanedUp = false;
    const source = new EventSource(`/api/tasks/${task.id}/events`);

    const startPolling = () => {
      if (timer || isCleanedUp) return;
      timer = setInterval(async () => {
        try {
          const data = await api<Task>(`/api/tasks/${task.id}`);
          if (isCleanedUp) return;
          
          setTask(prev => {
            const merged = mergeTask(prev, data);
            // If the task reached a terminal state, stop polling
            if (['completed', 'failed', 'canceled'].includes(merged.status)) {
              clearInterval(timer);
              timer = null;
            }
            return merged;
          });
        } catch (err) {
          console.error('Task polling failed:', err);
        }
      }, 3000);
    };

    source.onmessage = (event) => {
      if (isCleanedUp) return;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const data = JSON.parse(event.data);
      setTask(prev => {
        const merged = mergeTask(prev, data);
        // If the task reached a terminal state, close the event source
        if (['completed', 'failed', 'canceled'].includes(merged.status)) {
          source.close();
        }
        return merged;
      });
    };

    source.onerror = () => {
      if (isCleanedUp) return;
      source.close();
      startPolling();
    };

    return () => {
      isCleanedUp = true;
      source.close();
      if (timer) clearInterval(timer);
    };
  }, [task?.id]);

  async function refresh() {
    if (!task) return;
    try {
      const data = await api<Task>(`/api/tasks/${task.id}`);
      setTask(prev => mergeTask(prev, data));
    } catch (err) {
      console.error('Refresh task failed:', err);
    }
  }

  async function saveText() {
    if (!task) return;
    try {
      await api(`/api/tasks/${task.id}/text`, { method: 'PATCH', body: JSON.stringify({ text: editableText }) });
      const retried = await api<Task>(`/api/tasks/${task.id}/retry`, { method: 'POST' });
      notifiedTaskId.current = null;
      setTask(prev => mergeTask(prev, retried));
      await refresh();
      toast(t('textSavedTaskRestarted'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('saveTextFailed'), 'error');
    }
  }

  async function control(action: 'pause' | 'cancel' | 'resume' | 'retry') {
    if (!task) return;
    setError('');
    if (action === 'retry') {
      notifiedTaskId.current = null;
    }
    try {
      const updated = await api<Task>(`/api/tasks/${task.id}/${action}`, { method: 'POST' });
      setTask(prev => mergeTask(prev, updated));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${t('controlFailed')}: ${action}`);
    }
  }

  return (
    <div className="convert-pane-grid">
      {/* Target Selector Header */}
      <div className="p-3 bg-muted border border-border rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-ring flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t('selectedTarget')}
            </span>
            <span className="text-xs font-semibold truncate">
              {pdf ? pdf.original_name : t('noFileSelected')}
            </span>
          </div>
        </div>
        {pdf && (
          <span className="text-[11px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
            {pdf.page_count} {t('pagesCount')}
          </span>
        )}
      </div>

      {/* Mode Tabs */}
      <div className="convert-mode-selector">
        <button
          className={`convert-mode-btn text-xs ${mode === 'pages' ? 'is-active' : ''}`}
          onClick={() => setMode('pages')}
        >
          {t('pageRange')}
        </button>
        <button
          className={`convert-mode-btn text-xs ${mode === 'text' ? 'is-active' : ''}`}
          onClick={() => setMode('text')}
        >
          {t('selectedPastedText')}
        </button>
      </div>

      {/* Settings Options Card */}
      <div className="convert-form-card">
        {mode === 'pages' ? (
          <div className="form-group">
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="pages-input" className="mb-0">{t('pageExpression')}</label>
              {pdf && onJumpToPdfPage && (
                <button
                  type="button"
                  onClick={() => {
                    const match = pageExpression.match(/\d+/);
                    if (match) {
                      const pNum = parseInt(match[0], 10);
                      onJumpToPdfPage(pNum);
                    }
                  }}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium bg-transparent border-0 cursor-pointer p-0"
                >
                  <FileText size={13} />
                  <span>{t('locatePage') || '在阅读器中定位'}</span>
                </button>
              )}
            </div>
            <input
              id="pages-input"
              value={pageExpression}
              onChange={(e) => setPageExpression(e.target.value)}
              placeholder={t('pageExpressionPlaceholder')}
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="raw-text-input">{t('textToConvert')}</label>
            <textarea
              id="raw-text-input"
              value={textToConvert}
              onChange={(e) => {
                setTextToConvert(e.target.value);
                setEditableText(e.target.value);
              }}
              rows={4}
              placeholder={t('pasteTextPlaceholder')}
              className="text-xs"
            />
            <span className="text-[10px] font-bold text-muted-foreground text-right block mt-1">
              {textToConvert.trim().length} {t('chars')} ({t('textMinLength')})
            </span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="custom-title-input">{t('audioName') || '音频名称'}</label>
          <input
            id="custom-title-input"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={t('audioNamePlaceholder') || '输入生成音频的自定义名称（可选）'}
            className="text-xs"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="form-group">
            <label htmlFor="format-select">{t('format')}</label>
            <select
              id="format-select"
              value={format}
              onChange={(e) => setFormat(e.target.value as AppSettings['default_bilingual_format'])}
              className="text-xs"
            >
              <option value="sentence_pair">{t('sentencePair')}</option>
              <option value="paragraph_pair">{t('paragraphPair')}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="style-select">{t('style')}</label>
            <select
              id="style-select"
              value={style}
              onChange={(e) => setStyle(e.target.value as AppSettings['default_output_style'])}
              className="text-xs"
            >
              <option value="faithful">{t('faithful')}</option>
              <option value="plain_explanation">{t('plainExplanation')}</option>
              <option value="child_friendly">{t('childFriendly')}</option>
              <option value="exam_english">{t('examEnglish')}</option>
              <option value="business_english">{t('businessEnglish')}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="audio-mode-select">{t('audioMode')}</label>
            <select
              id="audio-mode-select"
              value={audioMode}
              onChange={(e) => setAudioMode(e.target.value)}
              className="text-xs"
            >
              <option value="bilingual">{t('bilingual')}</option>
              <option value="english">{t('englishOnly')}</option>
              <option value="chinese">{t('chineseOnly')}</option>
            </select>
          </div>
        </div>

        <Button
          onClick={createTask}
          disabled={(mode === 'pages' && !pdf) || (mode === 'text' && textToConvert.trim().length < 20)}
          className="btn-primary-gradient h-10 text-xs mt-2"
        >
          {t('startGenerating')}
        </Button>
      </div>

      {error && <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg">{error}</div>}

      {/* Task Status Widget */}
      {task && (
        <div className={`task-status-widget status-${task.status}`}>
          <div className="task-progress-header">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t('currentTask')}
              </span>
              <span className="text-xs font-bold flex items-center gap-1.5">
                <span className={`status-badge is-${task.status}`}>{task.status}</span>
              </span>
            </div>
            <span className="text-sm font-extrabold text-ring">{task.progress}%</span>
          </div>

          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
          </div>

          {/* Task Stepper Roadmap */}
          <div className="task-roadmap-container">
            <div className="task-roadmap-track">
              {steps.map((step, idx) => {
                const isCompleted = stepIndex > idx;
                const isActive = stepIndex === idx && task.status === 'running';
                const isFailed = stepIndex === idx && task.status === 'failed';
                const isPaused = stepIndex === idx && task.status === 'paused';
                const isCanceled = stepIndex === idx && task.status === 'canceled';

                let dotClass = 'is-pending';
                if (isCompleted) dotClass = 'is-completed';
                else if (isActive) dotClass = 'is-active';
                else if (isFailed) dotClass = 'is-failed';
                else if (isPaused) dotClass = 'is-paused';
                else if (isCanceled) dotClass = 'is-canceled';

                return (
                  <div key={idx} className="task-roadmap-node-wrapper">
                    {idx > 0 && (
                      <div className={`task-roadmap-line ${stepIndex >= idx ? 'is-active' : ''}`} />
                    )}
                    <div className={`task-roadmap-node ${dotClass}`} title={step.label}>
                      {isCompleted ? '✓' : idx + 1}
                    </div>
                  </div>
                );
              })}
            </div>
            {stepIndex < steps.length && (
              <div className="task-roadmap-active-step">
                <span className="task-roadmap-active-title">
                  {steps[Math.min(stepIndex, steps.length - 1)].label}
                </span>
                <span className="task-roadmap-active-desc">
                  {steps[Math.min(stepIndex, steps.length - 1)].desc}
                </span>
              </div>
            )}
          </div>

          {task.error_message && (
            <p className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 font-medium mt-2">
              {task.error_message}
            </p>
          )}

          {/* Task Control Actions */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
            {canPause(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('pause')} className="flex items-center gap-1 flex-1 text-[11px]">
                <Pause size={12} />
                <span>{t('pause')}</span>
              </Button>
            )}
            {canResume(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('resume')} className="flex items-center gap-1 flex-1 text-[11px]">
                <Play size={12} />
                <span>{t('resume')}</span>
              </Button>
            )}
            {canRetry(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('retry')} className="flex items-center gap-1 flex-1 text-[11px]">
                <RotateCcw size={12} />
                <span>{t('retry')}</span>
              </Button>
            )}
            {canCancel(task.status) && (
              <Button variant="destructive" size="sm" onClick={() => control('cancel')} className="flex items-center gap-1 text-[11px] hover:bg-destructive/90">
                <XCircle size={12} />
                <span>{t('cancel')}</span>
              </Button>
            )}
            
            <Button variant="ghost" size="iconSm" onClick={refresh} title={t('refreshStatus')}>
              <RefreshCw size={14} className="text-muted-foreground" />
            </Button>
          </div>
        </div>
      )}

      {/* Editor to correct transcription/extraction */}
      {task && ['pending', 'paused', 'failed'].includes(task.status) && editableText && (
        <div className="p-4 border border-border rounded-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FileText size={12} /> {t('extractedText')}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {t('extractedTextHint')}
            </span>
          </div>
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={5}
            className="text-xs"
          />
          <Button variant="secondary" size="sm" onClick={saveText} className="text-xs h-8">
            {t('saveAndRegenerate')}
          </Button>
        </div>
      )}

      {/* Finished alert */}
      {completedAudio && (
        <div className="p-3 bg-accent/30 border border-ring/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-ring" />
            <span className="text-xs font-semibold text-accent-foreground">{t('audioReady')}</span>
          </div>
          <Button size="sm" asChild className="btn-primary-gradient text-[11px] h-8">
            <a href={completedAudio.audio_url} target="_blank" rel="noreferrer noopener">
              {t('downloadMp3')}
            </a>
          </Button>
        </div>
      )}

      {/* Preview Segments */}
      {task?.segments && task.segments.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            className="w-full p-3 bg-muted border-none outline-none flex items-center justify-between cursor-pointer"
            onClick={() => setShowSegments(!showSegments)}
          >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t('bilingualSegmentPreview')} ({task.segments.length})
            </span>
            {showSegments ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>
          {showSegments && (
            <div className="max-h-60 overflow-y-auto p-2 flex flex-col gap-1.5 bg-card">
              {task.segments.map((segment) => (
                <div key={segment.index} className="p-2 border border-border rounded bg-muted/30 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-muted-foreground">#{segment.index + 1}</span>
                  </div>
                  <p className="font-semibold mb-0.5 leading-relaxed">{segment.english}</p>
                  <p className="text-muted-foreground leading-relaxed">{segment.chinese}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
