import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, XCircle, RotateCcw, FileText, CheckCircle2, ChevronDown, ChevronUp, Search, Loader2, Maximize2, Check, Sparkles, ChevronRight, Settings2, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings, AudioFile, PdfFile, Task } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { usePlayer } from '../context/PlayerContext';

const defaultSettings = {
  default_bilingual_format: 'sentence_pair',
  default_output_style: 'faithful',
} as const;

type InputMode = 'pages' | 'text';

type ConvertPaneProps = {
  pdf?: PdfFile;
  initialText?: string;
  onConversionComplete?: (audio: AudioFile) => void;
  onTaskCreated?: (task: Task) => void;
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

export default function ConvertPane({ pdf, initialText = '', onConversionComplete, onTaskCreated, onJumpToPdfPage }: ConvertPaneProps) {
  const { t, lang } = useT();
  const { toast } = useToast();
  const { activeAudio, setActiveAudio, isPlaying, togglePlay } = usePlayer();

  const [pageExpression, setPageExpression] = useState('');
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [extractMode, setExtractMode] = useState<'local' | 'ai'>('local');
  const [pipelineMode, setPipelineMode] = useState<'auto' | 'manual'>('auto');
  const notifiedTaskId = useRef<string | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);

  const handlePreExtractText = async () => {
    if (!pdf) return;
    setIsExtracting(true);
    try {
      const res = await api<{ text: string }>(`/api/pdfs/${pdf.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_expression: pageExpression }),
      });
      setOriginalExtractedText(res.text);
      setTextToConvert(res.text);
      setEditableText(res.text);
      setMode('text');
      if (pdf) {
        localStorage.removeItem(`pdf_audio_draft_${pdf.id}_${pageExpression}`);
      }
      setDraftStatus('idle');
      toast(
        lang === 'zh'
          ? '文本提取成功，已为您切换到"文本"编辑模式。'
          : 'Text extracted successfully. Switched to Text edit mode.',
        'success'
      );
    } catch (err: any) {
      toast(
        err?.message || (lang === 'zh' ? '无法解析该页码范围的文本' : 'Could not parse text for the specified page range.'),
        'error'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAiExtractText = async () => {
    if (!pdf) return;
    setIsExtracting(true);
    try {
      const res = await api<{ text: string }>(`/api/pdfs/${pdf.id}/extract-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_expression: pageExpression }),
      });
      setOriginalExtractedText(res.text);
      setTextToConvert(res.text);
      setEditableText(res.text);
      setMode('text');
      if (pdf) {
        localStorage.removeItem(`pdf_audio_draft_${pdf.id}_${pageExpression}`);
      }
      setDraftStatus('idle');
      toast(
        lang === 'zh'
          ? 'AI 文本提取成功，已为您切换到"文本"编辑模式。'
          : 'AI text extraction successful. Switched to Text edit mode.',
        'success'
      );
    } catch (err: any) {
      toast(
        err?.message || (lang === 'zh' ? 'AI 解析失败，请检查 AI 配置或尝试本地解析。' : 'AI extraction failed. Check AI settings or try Local Extract.'),
        'error'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const [originalExtractedText, setOriginalExtractedText] = useState('');
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Reset PDF-scoped state when target PDF changes.
  useEffect(() => {
    setPageExpression('1');
    setTask(null);
    setCompletedAudio(null);
    setError('');
    setShowSegments(false);
    setCustomTitle('');
    setOriginalExtractedText('');
    setIsFullscreenEditorOpen(false);
    setDraftStatus('idle');
    setShowAdvanced(false);
    setExtractMode('local');
    setIsExtracting(false);
    notifiedTaskId.current = null;

    const nextText = initialText || '';
    setTextToConvert(nextText);
    setEditableText(nextText);
    setMode(nextText ? 'text' : 'pages');
  }, [pdf?.id]);

  // Debounced Auto-save to localStorage
  useEffect(() => {
    if (mode === 'text' && pdf && textToConvert && textToConvert !== originalExtractedText) {
      setDraftStatus('saving');
      const timer = setTimeout(() => {
        localStorage.setItem(`pdf_audio_draft_${pdf.id}_${pageExpression}`, textToConvert);
        setDraftStatus('saved');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [textToConvert, mode, pdf, pageExpression, originalExtractedText]);

  // Load draft from localStorage on document/page change
  useEffect(() => {
    if (mode !== 'text' || !pdf) return;
    const savedDraft = localStorage.getItem(`pdf_audio_draft_${pdf.id}_${pageExpression}`);
    if (savedDraft) {
      setTextToConvert(savedDraft);
      setEditableText(savedDraft);
      setDraftStatus('saved');
      toast(
        lang === 'zh' ? '已自动载入未保存的本地草稿。' : 'Auto-loaded uncommitted local draft.',
        'success'
      );
    } else if (!initialText && !originalExtractedText) {
      setDraftStatus('idle');
    }
  }, [pdf?.id, pageExpression, mode]);

  const handleRevertToOriginal = () => {
    if (originalExtractedText) {
      setTextToConvert(originalExtractedText);
      setEditableText(originalExtractedText);
      if (pdf) {
        localStorage.removeItem(`pdf_audio_draft_${pdf.id}_${pageExpression}`);
      }
      setDraftStatus('idle');
      toast(
        lang === 'zh' ? '已恢复至初始解析的原文并清空草稿。' : 'Reverted to original text and cleared draft.',
        'success'
      );
    } else {
      toast(
        lang === 'zh' ? '没有可恢复的初始原文。' : 'No original text available to revert.',
        'error'
      );
    }
  };

  const normalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleMergeSelectedLines = (isFullscreen: boolean) => {
    const textarea = isFullscreen ? fullscreenTextareaRef.current : normalTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      toast(
        lang === 'zh' ? '请先在文本框中选中需要合并的多行文本！' : 'Please select multiple lines in the text area first!',
        'error'
      );
      return;
    }

    const selectedText = textToConvert.substring(start, end);
    const lines = selectedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length <= 1) {
      toast(
        lang === 'zh' ? '所选内容不足多行，无需合并。' : 'Selected text is not multi-line.',
        'error'
      );
      return;
    }

    let merged = '';
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        merged += lines[i];
      } else {
        const prev = lines[i - 1];
        const curr = lines[i];
        const lastCharOfPrev = prev.slice(-1);
        const firstCharOfCurr = curr.charAt(0);

        // Check for drop cap merging (e.g., 'W' + 'HEN' -> 'WHEN')
        const isDropCap = prev.length === 1 && /^[A-Z]$/.test(prev) && /^[A-Z]$/.test(firstCharOfCurr);
        const isChinese = /[\u4e00-\u9fa5]/.test(lastCharOfPrev) || /[\u4e00-\u9fa5]/.test(firstCharOfCurr);

        if (isDropCap) {
          merged += curr;
        } else if (isChinese) {
          merged += curr;
        } else {
          merged += ' ' + curr;
        }
      }
    }

    // Focus first
    textarea.focus();

    let success = false;
    try {
      // Use document.execCommand('insertText') to preserve native browser undo/redo history (Ctrl+Z / Cmd+Z)
      success = document.execCommand('insertText', false, merged);
    } catch (e) {
      console.warn('execCommand insertText failed, falling back to state replacement:', e);
    }

    if (!success) {
      const newText = textToConvert.substring(0, start) + merged + textToConvert.substring(end);
      setTextToConvert(newText);
      setEditableText(newText);
    }

    toast(
      lang === 'zh'
        ? `已成功将所选的 ${lines.length} 行合并为 1 行（支持 Cmd/Ctrl+Z 撤销）。`
        : `Successfully merged ${lines.length} lines into 1 (supports Cmd/Ctrl+Z to undo).`,
      'success'
    );

    // Re-select the merged text so the user can easily see or merge again
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + merged.length);
    }, 50);
  };

  const handleSmartMergeParagraphs = (isFullscreen: boolean) => {
    const textarea = isFullscreen ? fullscreenTextareaRef.current : normalTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    let textToFormat = '';
    let isEntireDoc = false;

    if (start === end) {
      // No selection: format the entire document
      textToFormat = textToConvert;
      isEntireDoc = true;
    } else {
      // Format only selection
      textToFormat = textToConvert.substring(start, end);
    }

    // Apply smart formatting algorithm
    // 1. Split into individual trimmed lines
    const rawLines = textToFormat.split(/\r?\n/).map(line => line.trim());
    if (rawLines.length === 0) return;

    // 2. Calculate average line length of WRAPPED lines (lines that do not end with sentence-ending punctuation)
    const wrappedLengths: number[] = [];
    const sentenceTerminatorRegex = /[.!?。！？”"]$/;

    for (const line of rawLines) {
      if (line.length <= 10) continue;
      if (!sentenceTerminatorRegex.test(line)) {
        wrappedLengths.push(line.length);
      }
    }

    const avgLen = wrappedLengths.length > 0
      ? wrappedLengths.reduce((a, b) => a + b, 0) / wrappedLengths.length
      : 40;

    const shortLineThreshold = Math.max(20, Math.floor(avgLen - 4));

    // 3. Segment lines into paragraphs based on blank lines OR (short line + sentence terminator)
    const paragraphs: string[][] = [];
    let currentPara: string[] = [];

    for (const line of rawLines) {
      if (!line) {
        if (currentPara.length > 0) {
          paragraphs.push(currentPara);
          currentPara = [];
        }
        continue;
      }

      // Check if the current line starts a list item or table row
      let isListStart = false;
      if (/^([-\*•▪◦●■→⏩➢▶▲\u2022\u25e6\u25aa\u25fe])/.test(line)) {
        isListStart = true;
      } else if (/^(\d+[\s\.\)])/.test(line)) {
        isListStart = true;
      } else if (/^([a-zA-Z][\.\)]\s)/.test(line)) {
        isListStart = true;
      }

      if (isListStart && currentPara.length > 0) {
        paragraphs.push(currentPara);
        currentPara = [];
      }

      currentPara.push(line);

      const endsWithPunctuation = sentenceTerminatorRegex.test(line);
      const isShort = line.length < shortLineThreshold;

      if (endsWithPunctuation && isShort) {
        paragraphs.push(currentPara);
        currentPara = [];
      }
    }

    if (currentPara.length > 0) {
      paragraphs.push(currentPara);
    }

    // 4. Merge lines within each paragraph
    const cleanedParagraphs = paragraphs.map(paraLines => {
      let mergedPara = '';
      for (let i = 0; i < paraLines.length; i++) {
        const line = paraLines[i];
        if (!mergedPara) {
          mergedPara = line;
        } else {
          const lastChar = mergedPara.slice(-1);
          const firstChar = line.charAt(0);

          const isDropCap = mergedPara.length === 1 && /^[A-Z]$/.test(mergedPara) && /^[A-Z]$/.test(firstChar);
          const isChinese = /[\u4e00-\u9fa5]/.test(lastChar) || /[\u4e00-\u9fa5]/.test(firstChar);

          if (isDropCap) {
            mergedPara += line;
          } else if (isChinese) {
            mergedPara += line;
          } else {
            // Hyphenated word wrap at line end
            if (mergedPara.endsWith("-")) {
              mergedPara = mergedPara.slice(0, -1) + line;
            } else {
              mergedPara += " " + line;
            }
          }
        }
      }
      return mergedPara;
    }).filter(Boolean);

    const formatted = cleanedParagraphs.join('\n\n');

    // Apply replacement via native execCommand to keep Undo history
    textarea.focus();
    if (isEntireDoc) {
      textarea.select();
    }

    let success = false;
    try {
      success = document.execCommand('insertText', false, formatted);
    } catch (e) {
      console.warn('execCommand insertText failed in smart merge:', e);
    }

    if (!success) {
      if (isEntireDoc) {
        setTextToConvert(formatted);
        setEditableText(formatted);
      } else {
        const newText = textToConvert.substring(0, start) + formatted + textToConvert.substring(end);
        setTextToConvert(newText);
        setEditableText(newText);
      }
    }

    toast(
      lang === 'zh'
        ? (isEntireDoc ? '已成功对全文完成智能排版。' : '已成功对选中内容完成智能段落合并。')
        : (isEntireDoc ? 'Successfully applied smart merge to entire text.' : 'Successfully applied smart merge to selection.'),
      'success'
    );

    // Re-select formatted text
    if (!isEntireDoc) {
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + formatted.length);
      }, 50);
    }
  };

  // Listen to Escape key globally to close fullscreen editor
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenEditorOpen) {
        setIsFullscreenEditorOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isFullscreenEditorOpen]);

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, isFullscreen: boolean) => {
    // Cmd+Enter (Mac) or Ctrl+Enter (Windows) to save and submit immediately
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isFullscreen) {
        setIsFullscreenEditorOpen(false);
      }
      createTask();
    }
  };

  const steps = lang === 'zh' ? [
    { label: '提取 PDF 文本', desc: '从 PDF 或选区中解析原始内容' },
    { label: 'AI 双语对齐与翻译', desc: '利用大模型生成精准中英对照' },
    { label: '分句语音合成', desc: '生成高品质双语朗读音频切片' },
    { label: '音频合成与正规化', desc: '拼接音频并优化电平与降噪' },
    { label: '生成同步双语字幕', desc: '生成与音频同步的播放器字幕' },
  ] : [
    { label: 'Extract PDF Text', desc: 'Parsing original content from PDF' },
    { label: 'AI Bilingual Translation', desc: 'Generating translation and alignment' },
    { label: 'Sentence Voice Synthesis', desc: 'Generating read-aloud audio clips' },
    { label: 'Audio Merging & Normalizing', desc: 'Merging audio and optimizing volume' },
    { label: 'Generate Synced Subtitles', desc: 'Rendering synced player subtitles' },
  ];

  const stepIndex = task ? getStepIndex(task.stage || 'pending') : 0;

  // Sync initialText if it changes from parent
  useEffect(() => {
    const nextText = initialText || '';
    setTextToConvert(nextText);
    setEditableText(nextText);
    setOriginalExtractedText('');
    setDraftStatus('idle');
    setMode(nextText ? 'text' : 'pages');
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
      ? { pdf_id: pdf?.id, input_type: 'selected_text', selected_text: textToConvert, bilingual_format: format, output_style: style, audio_mode: audioMode, custom_title: customTitle.trim() || undefined, extract_mode: pipelineMode }
      : { pdf_id: pdf!.id, input_type: 'page_range', page_expression: pageExpression, bilingual_format: format, output_style: style, audio_mode: audioMode, custom_title: customTitle.trim() || undefined, extract_mode: pipelineMode };

    try {
      const created = await api<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      setTask(created);
      onTaskCreated?.(created);
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

  const isTaskVisible = task !== null;

  return (
    <div className="convert-pane">
      {/* ── Section 1: Config Header Bar ── */}
      <div className="convert-config-section">
        {/* Pipeline Mode Toggle */}
        <div className="convert-pipeline-toggle">
          <button
            type="button"
            className={`convert-pipeline-btn ${pipelineMode === 'auto' ? 'is-active' : ''}`}
            onClick={() => setPipelineMode('auto')}
          >
            <Sparkles size={12} />
            <span>{t('extractModeAuto')}</span>
          </button>
          <button
            type="button"
            className={`convert-pipeline-btn ${pipelineMode === 'manual' ? 'is-active' : ''}`}
            onClick={() => setPipelineMode('manual')}
          >
            <FileText size={12} />
            <span>{t('extractModeManual')}</span>
          </button>
        </div>

        {/* Target + Mode row */}
        <div className="convert-config-row">
          {/* Target info */}
          <div className="convert-target-info">
            <FileText size={14} className="text-ring shrink-0" />
            <div className="convert-target-name">
              <span className="convert-target-label">{t('selectedTarget')}</span>
              <span className="convert-target-value">
                {pdf ? pdf.original_name : t('noFileSelected')}
              </span>
            </div>
            {pdf && (
              <span className="convert-target-pages">
                {pdf.page_count} {t('pagesCount')}
              </span>
            )}
          </div>

          {/* Mode switch */}
          <div className="convert-mode-group">
            <button
              className={`convert-mode-btn ${mode === 'pages' ? 'is-active' : ''}`}
              onClick={() => setMode('pages')}
            >
              {t('pageRange')}
            </button>
            <button
              className={`convert-mode-btn ${mode === 'text' ? 'is-active' : ''}`}
              onClick={() => setMode('text')}
            >
              {t('selectedPastedText')}
            </button>
          </div>
        </div>

        {/* Input area: pages or text */}
        <div className="convert-input-area">
          {mode === 'pages' ? (
            <div className="convert-pages-row">
              <input
                id="pages-input"
                value={pageExpression}
                onChange={(e) => setPageExpression(e.target.value)}
                placeholder={t('pageExpressionPlaceholder')}
                className="convert-input flex-1"
              />
              {pdf && pipelineMode === 'manual' && (
                <div className="convert-extract-group">
                  <div className="convert-extract-mode">
                    <button
                      type="button"
                      className={`convert-extract-mode-btn ${extractMode === 'local' ? 'is-active' : ''}`}
                      onClick={() => setExtractMode('local')}
                    >
                      {t('extractLocal')}
                    </button>
                    <button
                      type="button"
                      className={`convert-extract-mode-btn ${extractMode === 'ai' ? 'is-active' : ''}`}
                      onClick={() => setExtractMode('ai')}
                    >
                      {t('extractAi')}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={isExtracting || !pageExpression.trim()}
                    onClick={extractMode === 'local' ? handlePreExtractText : handleAiExtractText}
                    className="convert-extract-btn"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>{extractMode === 'ai' ? t('extractingAi') : (lang === 'zh' ? '提取中...' : 'Extracting...')}</span>
                      </>
                    ) : (
                      <>
                        <Search size={13} />
                        <span>{lang === 'zh' ? '预解析文本并编辑' : 'Pre-extract & Edit'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
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
                  className="convert-link-btn"
                >
                  <FileText size={13} />
                  <span>{t('locatePage')}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="convert-text-block">
              <div className="convert-text-header">
                <div className="convert-text-title-row">
                  <span className="convert-text-label">{t('textToConvert')}</span>
                  {draftStatus === 'saving' && (
                    <span className="convert-draft-status is-saving">
                      ({lang === 'zh' ? '保存中...' : 'saving...'})
                    </span>
                  )}
                  {draftStatus === 'saved' && (
                    <span className="convert-draft-status is-saved">
                      <Check size={11} /> {lang === 'zh' ? '已存草稿' : 'autosaved'}
                    </span>
                  )}
                </div>
                {pipelineMode === 'manual' && (
                  <div className="convert-text-actions">
                    {originalExtractedText && (
                      <button
                        type="button"
                        onClick={handleRevertToOriginal}
                        className="convert-text-action-btn"
                        title={lang === 'zh' ? '恢复为初始 PDF 提取原文' : 'Revert to original extracted text'}
                      >
                        <RotateCcw size={11} />
                        <span>{lang === 'zh' ? '恢复原文' : 'Revert'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsFullscreenEditorOpen(true)}
                      className="convert-text-action-btn is-primary"
                    >
                      <Maximize2 size={11} />
                      <span>{lang === 'zh' ? '全屏编辑' : 'Fullscreen'}</span>
                    </button>
                  </div>
                )}
              </div>

              <textarea
                id="raw-text-input"
                ref={normalTextareaRef}
                value={textToConvert}
                onChange={(e) => {
                  setTextToConvert(e.target.value);
                  setEditableText(e.target.value);
                }}
                rows={8}
                placeholder={t('pasteTextPlaceholder')}
                className="convert-textarea"
                onKeyDown={(e) => handleEditorKeyDown(e, false)}
              />

              <div className="convert-text-footer">
                <span className="convert-text-footer-left">
                  {draftStatus === 'saved' && (lang === 'zh' ? '草稿已保存在本地' : 'Draft saved locally')}
                </span>
                <span className="convert-text-footer-right">
                  {textToConvert.trim().length} {t('chars')} ({t('textMinLength')})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Audio Name */}
        <div className="convert-name-row">
          <input
            id="custom-title-input"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={t('audioNamePlaceholder')}
            className="convert-input"
          />
        </div>

        {/* Advanced Settings Toggle */}
        <div className="convert-advanced-toggle">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="convert-toggle-btn"
          >
            <Settings2 size={13} />
            <span>{t('advancedSettings')}</span>
            <ChevronRight size={13} className={`convert-toggle-arrow ${showAdvanced ? 'is-open' : ''}`} />
          </button>

          <div className={`convert-advanced-body ${showAdvanced ? 'is-open' : ''}`}>
            <div>
              <div className="convert-advanced-grid">
                <div className="convert-advanced-field">
                  <label htmlFor="format-select">{t('format')}</label>
                  <select
                    id="format-select"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as AppSettings['default_bilingual_format'])}
                  >
                    <option value="sentence_pair">{t('sentencePair')}</option>
                    <option value="paragraph_pair">{t('paragraphPair')}</option>
                  </select>
                </div>
                <div className="convert-advanced-field">
                  <label htmlFor="style-select">{t('style')}</label>
                  <select
                    id="style-select"
                    value={style}
                    onChange={(e) => setStyle(e.target.value as AppSettings['default_output_style'])}
                  >
                    <option value="faithful">{t('faithful')}</option>
                    <option value="plain_explanation">{t('plainExplanation')}</option>
                    <option value="child_friendly">{t('childFriendly')}</option>
                    <option value="exam_english">{t('examEnglish')}</option>
                    <option value="business_english">{t('businessEnglish')}</option>
                  </select>
                </div>
                <div className="convert-advanced-field">
                  <label htmlFor="audio-mode-select">{t('audioMode')}</label>
                  <select
                    id="audio-mode-select"
                    value={audioMode}
                    onChange={(e) => setAudioMode(e.target.value)}
                  >
                    <option value="bilingual">{t('bilingual')}</option>
                    <option value="english">{t('englishOnly')}</option>
                    <option value="chinese">{t('chineseOnly')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={createTask}
          disabled={(mode === 'pages' && (!pdf || !pageExpression.trim())) || (mode === 'text' && textToConvert.trim().length < 20)}
          className="convert-generate-btn"
        >
          {t('startGenerating')}
        </Button>

        {error && (
          <div className="convert-error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Section 2: Task Area ── */}
      {isTaskVisible && (
        <div className={`convert-task-section status-${task.status}`}>
          {/* Progress header */}
          <div className="convert-task-header">
            <div className="convert-task-header-left">
              <span className="convert-task-label">{t('currentTask')}</span>
              <span className={`status-badge is-${task.status}`}>{task.status}</span>
            </div>
            <span className="convert-task-percent">{task.progress}%</span>
          </div>

          <div className="convert-progress-bar">
            <div className="convert-progress-fill" style={{ width: `${task.progress}%` }} />
          </div>

          {/* Vertical Timeline */}
          <div className="convert-timeline">
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
                <div key={idx} className={`convert-timeline-item ${dotClass}`}>
                  <div className="convert-timeline-line-wrapper">
                    {idx < steps.length - 1 && <div className="convert-timeline-line" />}
                  </div>
                  <div className={`convert-timeline-dot ${dotClass}`}>
                    {isCompleted ? (
                      <Check size={10} strokeWidth={3} />
                    ) : isFailed ? (
                      <XCircle size={10} strokeWidth={2} />
                    ) : isPaused ? (
                      <Pause size={9} strokeWidth={2} />
                    ) : isActive ? (
                      <Loader2 size={10} strokeWidth={2.5} className="animate-spin" />
                    ) : (
                      <span className="convert-timeline-dot-num">{idx + 1}</span>
                    )}
                  </div>
                  <div className="convert-timeline-content">
                    <span className="convert-timeline-title">{step.label}</span>
                    <span className="convert-timeline-desc">{step.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {task.error_message && (
            <div className="convert-task-error">
              {task.error_message}
            </div>
          )}

          {/* Task Controls */}
          <div className="convert-task-controls">
            {canPause(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('pause')} className="convert-ctrl-btn">
                <Pause size={12} />
                <span>{t('pause')}</span>
              </Button>
            )}
            {canResume(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('resume')} className="convert-ctrl-btn">
                <Play size={12} />
                <span>{t('resume')}</span>
              </Button>
            )}
            {canRetry(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('retry')} className="convert-ctrl-btn">
                <RotateCcw size={12} />
                <span>{t('retry')}</span>
              </Button>
            )}
            {canCancel(task.status) && (
              <Button variant="destructive" size="sm" onClick={() => control('cancel')} className="convert-ctrl-btn is-destructive">
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

      {/* ── Section 3: Results / Editor ── */}
      {/* Text editor when paused or failed */}
      {task && ['pending', 'paused', 'failed'].includes(task.status) && editableText && (
        <div className="convert-editor-section">
          <div className="convert-editor-header">
            <FileText size={12} />
            <span>{t('extractedText')}</span>
            <span className="convert-editor-hint">{t('extractedTextHint')}</span>
          </div>
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={5}
            className="convert-editor-textarea"
          />
          <Button variant="secondary" size="sm" onClick={saveText} className="convert-editor-save-btn">
            {t('saveAndRegenerate')}
          </Button>
        </div>
      )}

      {/* Completed audio */}
      {completedAudio && (
        <div className="convert-completed-section">
          <div className="convert-completed-left">
            <CheckCircle2 size={16} className="text-ring" />
            <span className="convert-completed-text">{t('audioReady')}</span>
          </div>
          <div className="convert-completed-actions">
            {/* Play button */}
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                if (activeAudio?.id === completedAudio.id) {
                  togglePlay();
                } else {
                  setActiveAudio(completedAudio);
                }
              }}
              className="convert-ctrl-btn"
            >
              {activeAudio?.id === completedAudio.id && isPlaying ? (
                <Pause size={12} />
              ) : (
                <Play size={12} />
              )}
              <span>{activeAudio?.id === completedAudio.id && isPlaying ? t('pause') : t('play')}</span>
            </Button>
            <Button size="sm" asChild className="convert-download-btn">
              <a href={completedAudio.audio_url} target="_blank" rel="noreferrer noopener">
                {t('downloadMp3')}
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Bilingual Segment Preview */}
      {task?.segments && task.segments.length > 0 && (
        <div className="convert-segments-section">
          <button
            className="convert-segments-toggle"
            onClick={() => setShowSegments(!showSegments)}
          >
            <span className="convert-segments-label">
              {t('bilingualSegmentPreview')} ({task.segments.length})
            </span>
            {showSegments ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showSegments && (
            <div className="convert-segments-body">
              {task.segments.map((segment) => (
                <div key={segment.index} className="convert-segment-item">
                  <span className="convert-segment-num">#{segment.index}</span>
                  <p className="convert-segment-en">{segment.english}</p>
                  <p className="convert-segment-zh">{segment.chinese}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Fullscreen Editor Modal ── */}
      {isFullscreenEditorOpen && (
        <div className="convert-fullscreen-overlay">
          <div className="convert-fullscreen-modal">
            {/* Modal Header */}
            <div className="convert-fullscreen-header">
              <div className="convert-fullscreen-title-group">
                <h3 className="convert-fullscreen-title">
                  {lang === 'zh' ? '全屏文本编辑器' : 'Fullscreen Text Editor'}
                </h3>
                <div className="convert-fullscreen-status">
                  {draftStatus === 'saving' && (
                    <span className="animate-pulse">{lang === 'zh' ? '保存中...' : 'Saving...'}</span>
                  )}
                  {draftStatus === 'saved' && (
                    <span className="text-ring flex items-center gap-1">
                      <Check size={11} /> {lang === 'zh' ? '草稿已保存' : 'Draft saved'}
                    </span>
                  )}
                </div>
              </div>
              <div className="convert-fullscreen-actions">
                {originalExtractedText && (
                  <button
                    type="button"
                    onClick={handleRevertToOriginal}
                    className="convert-fs-action-btn"
                  >
                    <RotateCcw size={12} />
                    <span>{lang === 'zh' ? '恢复原文' : 'Revert'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleMergeSelectedLines(true)}
                  className="convert-fs-action-btn"
                  title={lang === 'zh' ? '将选中的多行文本合并为一行' : 'Merge selected lines into one line'}
                >
                  <FileText size={12} />
                  <span>{lang === 'zh' ? '合并选中行' : 'Merge Lines'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSmartMergeParagraphs(true)}
                  className="convert-fs-action-btn"
                  title={lang === 'zh' ? '合并段落中的多余换行' : 'Merge newlines inside paragraphs'}
                >
                  <Sparkles size={12} />
                  <span>{lang === 'zh' ? '智能排版' : 'Smart Format'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreenEditorOpen(false)}
                  className="convert-fs-done-btn"
                >
                  {lang === 'zh' ? '完成编辑' : 'Done'}
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="convert-fullscreen-body">
              <textarea
                ref={fullscreenTextareaRef}
                value={textToConvert}
                onChange={(e) => {
                  setTextToConvert(e.target.value);
                  setEditableText(e.target.value);
                }}
                placeholder={t('pasteTextPlaceholder')}
                className="convert-fullscreen-textarea"
                onKeyDown={(e) => handleEditorKeyDown(e, true)}
              />
            </div>

            {/* Modal Footer */}
            <div className="convert-fullscreen-footer">
              <span>{lang === 'zh' ? '支持直接编辑，自动保存草稿' : 'Edit freely — auto-saves draft'}</span>
              <div className="convert-fullscreen-footer-right">
                <span className="convert-fullscreen-chars">
                  {textToConvert.trim().length} {t('chars')}
                </span>
                <Button size="sm" onClick={() => setIsFullscreenEditorOpen(false)} className="convert-fullscreen-confirm-btn">
                  {lang === 'zh' ? '确定并返回' : 'Confirm & Close'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
