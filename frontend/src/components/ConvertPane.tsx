import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, XCircle, RotateCcw, HelpCircle, FileText, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings, AudioFile, PdfFile, Task } from '../api/types';
import { Button } from './ui/button';

const defaultSettings = {
  default_bilingual_format: 'sentence_pair',
  default_output_style: 'faithful',
} as const;

type InputMode = 'pages' | 'text';

type ConvertPaneProps = {
  pdf?: PdfFile;
  initialText?: string;
  onConversionComplete?: (audio: AudioFile) => void;
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

export default function ConvertPane({ pdf, initialText = '', onConversionComplete }: ConvertPaneProps) {
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
  const notifiedTaskId = useRef<string | null>(null);

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
    } catch {}
  }

  async function createTask() {
    setError('');
    setCompletedAudio(null);
    notifiedTaskId.current = null;
    if (mode === 'pages' && !pdf) {
      return setError('Please select a PDF file in the library first.');
    }
    if (mode === 'text' && textToConvert.trim().length < 20) {
      return setError('Text must be at least 20 characters.');
    }

    const payload = mode === 'text'
      ? { pdf_id: pdf?.id, input_type: 'selected_text', selected_text: textToConvert, bilingual_format: format, output_style: style, audio_mode: audioMode }
      : { pdf_id: pdf!.id, input_type: 'page_range', page_expression: pageExpression, bilingual_format: format, output_style: style, audio_mode: audioMode };

    try {
      const created = await api<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      setTask(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
  }

  // SSE and Polling for task tracking
  useEffect(() => {
    if (!task) return;
    const source = new EventSource(`/api/tasks/${task.id}/events`);
    
    const timer = setInterval(async () => {
      try {
        const data = await api<Task>(`/api/tasks/${task.id}`);
        setTask(prev => {
          if (!prev || prev.id !== data.id) return data;
          return {
            ...prev,
            ...data,
            segments: data.segments?.length ? data.segments : prev.segments,
            extracted_text: data.extracted_text || prev.extracted_text,
          };
        });
        if (data.extracted_text) setEditableText(data.extracted_text);
        findCompletedAudio(data).catch(() => undefined);
      } catch {}
    }, 2500);

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTask(prev => {
        if (!prev || prev.id !== data.id) return data;
        return {
          ...prev,
          ...data,
          segments: data.segments?.length ? data.segments : prev.segments,
          extracted_text: data.extracted_text || prev.extracted_text,
        };
      });
      findCompletedAudio(data).catch(() => undefined);
    };

    source.onerror = () => source.close();

    return () => {
      source.close();
      clearInterval(timer);
    };
  }, [task?.id]);

  async function refresh() {
    if (!task) return;
    try {
      const data = await api<Task>(`/api/tasks/${task.id}`);
      setTask(prev => {
        if (!prev || prev.id !== data.id) return data;
        return {
          ...prev,
          ...data,
          segments: data.segments?.length ? data.segments : prev.segments,
          extracted_text: data.extracted_text || prev.extracted_text,
        };
      });
      if (data.extracted_text) setEditableText(data.extracted_text);
      await findCompletedAudio(data);
    } catch {}
  }

  async function saveText() {
    if (!task) return;
    try {
      await api(`/api/tasks/${task.id}/text`, { method: 'PATCH', body: JSON.stringify({ text: editableText }) });
      const retried = await api<Task>(`/api/tasks/${task.id}/retry`, { method: 'POST' });
      notifiedTaskId.current = null;
      setTask(prev => {
        if (!prev || prev.id !== retried.id) return retried;
        return {
          ...prev,
          ...retried,
          segments: retried.segments?.length ? retried.segments : prev.segments,
          extracted_text: retried.extracted_text || prev.extracted_text,
        };
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save text and regenerate');
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
      setTask(prev => {
        if (!prev || prev.id !== updated.id) return updated;
        return {
          ...prev,
          ...updated,
          segments: updated.segments?.length ? updated.segments : prev.segments,
          extracted_text: updated.extracted_text || prev.extracted_text,
        };
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} task`);
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
              Selected Target
            </span>
            <span className="text-xs font-semibold truncate">
              {pdf ? pdf.original_name : 'No file selected (Pasted text only)'}
            </span>
          </div>
        </div>
        {pdf && (
          <span className="text-[11px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            {pdf.page_count} pages
          </span>
        )}
      </div>

      {/* Mode Tabs */}
      <div className="convert-mode-selector">
        <button
          className={`convert-mode-btn text-xs ${mode === 'pages' ? 'is-active' : ''}`}
          onClick={() => setMode('pages')}
        >
          Page Range
        </button>
        <button
          className={`convert-mode-btn text-xs ${mode === 'text' ? 'is-active' : ''}`}
          onClick={() => setMode('text')}
        >
          Selected / Pasted Text
        </button>
      </div>

      {/* Settings Options Card */}
      <div className="convert-form-card">
        {mode === 'pages' ? (
          <div className="form-group">
            <label htmlFor="pages-input">Page Expression</label>
            <input
              id="pages-input"
              value={pageExpression}
              onChange={(e) => setPageExpression(e.target.value)}
              placeholder="e.g. 1-3, 5, 8-10"
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="raw-text-input">Text to Convert</label>
            <textarea
              id="raw-text-input"
              value={textToConvert}
              onChange={(e) => {
                setTextToConvert(e.target.value);
                setEditableText(e.target.value);
              }}
              rows={4}
              placeholder="Paste English text here (minimum 20 characters)..."
              className="text-xs"
            />
            <span className="text-[10px] font-bold text-muted-foreground text-right block mt-1">
              {textToConvert.trim().length} chars (minimum 20)
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="form-group">
            <label htmlFor="format-select">Format</label>
            <select
              id="format-select"
              value={format}
              onChange={(e) => setFormat(e.target.value as AppSettings['default_bilingual_format'])}
              className="text-xs"
            >
              <option value="sentence_pair">Sentence pair</option>
              <option value="paragraph_pair">Paragraph pair</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="style-select">Style</label>
            <select
              id="style-select"
              value={style}
              onChange={(e) => setStyle(e.target.value as AppSettings['default_output_style'])}
              className="text-xs"
            >
              <option value="faithful">Faithful</option>
              <option value="plain_explanation">Plain explanation</option>
              <option value="child_friendly">Child-friendly</option>
              <option value="exam_english">Exam English</option>
              <option value="business_english">Business English</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="audio-mode-select">Audio Mode</label>
            <select
              id="audio-mode-select"
              value={audioMode}
              onChange={(e) => setAudioMode(e.target.value)}
              className="text-xs"
            >
              <option value="bilingual">Bilingual</option>
              <option value="english">English only</option>
              <option value="chinese">Chinese only</option>
            </select>
          </div>
        </div>

        <Button
          onClick={createTask}
          disabled={(mode === 'pages' && !pdf) || (mode === 'text' && textToConvert.trim().length < 20)}
          className="btn-primary-gradient h-10 text-xs mt-2"
        >
          Start Generating Audio
        </Button>
      </div>

      {error && <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg">{error}</div>}

      {/* Task Status Widget */}
      {task && (
        <div className={`task-status-widget ${task.status === 'failed' ? 'is-failed' : task.status === 'paused' ? 'is-paused' : ''}`}>
          <div className="task-progress-header">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Current Task
              </span>
              <span className="text-xs font-bold flex items-center gap-1.5">
                <span className={`status-badge is-${task.status}`}>{task.status}</span>
                <span className="text-muted-foreground">{task.stage}</span>
              </span>
            </div>
            <span className="text-sm font-extrabold text-ring">{task.progress}%</span>
          </div>

          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
          </div>

          {task.error_message && (
            <p className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 font-medium">
              {task.error_message}
            </p>
          )}

          {/* Task Control Actions */}
          <div className="flex items-center gap-2 mt-1">
            {canPause(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('pause')} className="flex items-center gap-1 flex-1 text-[11px]">
                <Pause size={12} />
                <span>Pause</span>
              </Button>
            )}
            {canResume(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('resume')} className="flex items-center gap-1 flex-1 text-[11px]">
                <Play size={12} />
                <span>Resume</span>
              </Button>
            )}
            {canRetry(task.status) && (
              <Button variant="secondary" size="sm" onClick={() => control('retry')} className="flex items-center gap-1 flex-1 text-[11px]">
                <RotateCcw size={12} />
                <span>Retry</span>
              </Button>
            )}
            {canCancel(task.status) && (
              <Button variant="destructive" size="sm" onClick={() => control('cancel')} className="flex items-center gap-1 text-[11px] hover:bg-destructive/90">
                <XCircle size={12} />
                <span>Cancel</span>
              </Button>
            )}
            
            <Button variant="ghost" size="iconSm" onClick={refresh} title="Refresh Status">
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
              <FileText size={12} /> Extracted Text (Editable)
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              Review and correct OCR or alignment issues
            </span>
          </div>
          <textarea
            value={editableText}
            onChange={(e) => setEditableText(e.target.value)}
            rows={5}
            className="text-xs"
          />
          <Button variant="secondary" size="sm" onClick={saveText} className="text-xs h-8">
            Save Changes & Regenerate Audio
          </Button>
        </div>
      )}

      {/* Finished alert */}
      {completedAudio && (
        <div className="p-3 bg-accent/30 border border-ring/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-ring" />
            <span className="text-xs font-semibold text-accent-foreground">Audio file is ready!</span>
          </div>
          <Button size="sm" asChild className="btn-primary-gradient text-[11px] h-8">
            <a href={completedAudio.audio_url} target="_blank" rel="noreferrer noopener">
              Download MP3
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
              Bilingual Segment Preview ({task.segments.length})
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
