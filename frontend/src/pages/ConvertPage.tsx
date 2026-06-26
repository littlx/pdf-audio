import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AppSettings, AudioFile, PdfFile, Task } from '../api/types';
import { Button } from '@/components/ui/button';

const defaultSettings = {
  default_bilingual_format: 'sentence_pair',
  default_output_style: 'faithful',
} as const;

type InputMode = 'pages' | 'text';

function canPause(status: string) { return ['pending', 'running'].includes(status); }
function canCancel(status: string) { return !['completed', 'failed', 'canceled'].includes(status); }
function canResume(status: string) { return status === 'paused'; }
function canRetry(status: string) { return ['failed', 'paused', 'canceled'].includes(status); }

export default function ConvertPage({ pdf, selectedText }: { pdf?: PdfFile; selectedText?: string }) {
  const [pageExpression, setPageExpression] = useState('1');
  const [format, setFormat] = useState<AppSettings['default_bilingual_format']>(defaultSettings.default_bilingual_format);
  const [style, setStyle] = useState<AppSettings['default_output_style']>(defaultSettings.default_output_style);
  const [audioMode, setAudioMode] = useState('bilingual');
  const [task, setTask] = useState<Task | null>(null);
  const [editableText, setEditableText] = useState(selectedText || '');
  const [error, setError] = useState('');
  const [previewPage, setPreviewPage] = useState(pdf?.last_preview_page || 1);
  const [outline, setOutline] = useState<{ level: number; title: string; page: number }[]>([]);
  const [textToConvert, setTextToConvert] = useState(selectedText || '');
  const [mode, setMode] = useState<InputMode>(selectedText ? 'text' : 'pages');
  const [completedAudio, setCompletedAudio] = useState<AudioFile | null>(null);

  useEffect(() => {
    api<AppSettings>('/api/settings').then((settings) => {
      setFormat(settings.default_bilingual_format || defaultSettings.default_bilingual_format);
      setStyle(settings.default_output_style || defaultSettings.default_output_style);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!pdf) return;
    api<{ level: number; title: string; page: number }[]>(`/api/pdfs/${pdf.id}/outline`).then(setOutline).catch(() => setOutline([]));
  }, [pdf?.id]);

  useEffect(() => {
    if (!pdf) return;
    api(`/api/pdfs/${pdf.id}/last-page`, { method: 'PATCH', body: JSON.stringify({ page: previewPage }) }).catch(() => undefined);
  }, [pdf?.id, previewPage]);

  function captureSelection() {
    const text = window.getSelection()?.toString().trim() || '';
    if (text) { setTextToConvert(text); setMode('text'); }
  }

  function goPreviewPage(page: number) {
    if (!pdf) return;
    setPreviewPage(Math.max(1, Math.min(page, pdf.page_count)));
  }

  async function findCompletedAudio(currentTask: Task) {
    if (currentTask.status !== 'completed') return;
    const list = await api<AudioFile[]>('/api/audios');
    const audio = list.find((item) => item.task_id === currentTask.id) || null;
    setCompletedAudio(audio);
  }

  async function createTask() {
    setError('');
    setCompletedAudio(null);
    if (mode === 'pages' && !pdf) return setError('Choose a PDF before starting a page range conversion.');
    if (mode === 'text' && textToConvert.trim().length < 20) return setError('Pasted text must be at least 20 characters.');
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

  useEffect(() => {
    if (!task) return;
    const source = new EventSource(`/api/tasks/${task.id}/events`);
    const timer = setInterval(async () => {
      try {
        const data = await api<Task>(`/api/tasks/${task.id}`);
        setTask(data);
        if (data.extracted_text) setEditableText(data.extracted_text);
        findCompletedAudio(data).catch(() => undefined);
      } catch {}
    }, 2500);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTask(data);
      findCompletedAudio(data).catch(() => undefined);
    };
    source.onerror = () => source.close();
    return () => { source.close(); clearInterval(timer); };
  }, [task?.id]);

  async function refresh() {
    if (!task) return;
    const data = await api<Task>(`/api/tasks/${task.id}`);
    setTask(data);
    if (data.extracted_text) setEditableText(data.extracted_text);
    await findCompletedAudio(data);
  }

  async function saveText() {
    if (!task) return;
    await api(`/api/tasks/${task.id}/text`, { method: 'PATCH', body: JSON.stringify({ text: editableText }) });
    const retried = await api<Task>(`/api/tasks/${task.id}/retry`, { method: 'POST' });
    setTask(retried);
    await refresh();
  }

  async function control(action: 'pause' | 'cancel' | 'resume' | 'retry') {
    if (!task) return;
    setError('');
    try {
      const updated = await api<Task>(`/api/tasks/${task.id}/${action}`, { method: 'POST' });
      setTask(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} task`);
    }
  }

  if (!pdf && mode === 'pages') {
    return <section className="page compact-page"><div className="empty-state"><h2>Select a PDF first</h2><p>Open Library and choose a PDF before page range conversion.</p></div></section>;
  }

  return (
    <section className="page convert-workbench" onMouseUp={captureSelection}>
      <div className="convert-preview-pane">
        {pdf && <>
          <div className="pdf-toolbar">
            <strong>{pdf.original_name}</strong>
            <Button variant="secondary" size="sm" disabled={previewPage <= 1} onClick={() => goPreviewPage(previewPage - 1)}>Prev</Button>
            <span>{previewPage}/{pdf.page_count}</span>
            <Button variant="secondary" size="sm" disabled={previewPage >= pdf.page_count} onClick={() => goPreviewPage(previewPage + 1)}>Next</Button>
            {outline.length > 0 && <select onChange={(e) => e.target.value && goPreviewPage(Number(e.target.value))} defaultValue=""><option value="">TOC</option>{outline.map((item, idx) => <option key={idx} value={item.page}>{'·'.repeat(Math.max(0, item.level - 1))} {item.title}</option>)}</select>}
          </div>
          <iframe title="PDF preview" src={`/api/pdfs/${pdf.id}/file#page=${previewPage}&view=FitH`} />
        </>}
      </div>

      <aside className="convert-side-panel">
        <div className="panel-section">
          <h2>Create audio</h2>
          {pdf && <p className="source-meta">Source: <span>{pdf.original_name}</span></p>}
          <p className="hint">PDF text selection may depend on browser support. You can also <a href={pdf ? `/api/pdfs/${pdf.id}/file` : '#'} target="_blank" rel="noreferrer noopener">open in a new tab</a> and paste text below.</p>
        </div>

        <div className="mode-tabs">
          <button className={mode === 'pages' ? 'is-active' : ''} onClick={() => setMode('pages')}>Pages</button>
          <button className={mode === 'text' ? 'is-active' : ''} onClick={() => setMode('text')}>Pasted text</button>
        </div>

        <div className="panel-section form-grid dense-form">
          {mode === 'pages' ? <label>Pages<input value={pageExpression} onChange={(e) => setPageExpression(e.target.value)} placeholder="1-3, 5" /></label> : <label>Text to convert<textarea value={textToConvert} onChange={(e) => setTextToConvert(e.target.value)} rows={6} placeholder="Paste at least 20 characters" /><small>{textToConvert.trim().length}/20 minimum</small></label>}
          <label>Format<select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}><option value="sentence_pair">Sentence pair</option><option value="paragraph_pair">Paragraph pair</option></select></label>
          <label>Style<select value={style} onChange={(e) => setStyle(e.target.value as typeof style)}><option value="faithful">Faithful</option><option value="plain_explanation">Plain explanation</option><option value="child_friendly">Child-friendly</option><option value="exam_english">Exam English</option><option value="business_english">Business English</option></select></label>
          <label>Audio<select value={audioMode} onChange={(e) => setAudioMode(e.target.value)}><option value="bilingual">Bilingual</option><option value="english">English only</option><option value="chinese">Chinese only</option></select></label>
          <Button onClick={createTask} disabled={(mode === 'pages' && !pdf) || (mode === 'text' && textToConvert.trim().length < 20)}>Start conversion</Button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        {task && <div className="task-panel panel-section sticky-task">
          <h3>Task</h3>
          <div className="task-meta"><span className={`status-badge is-${task.status}`}>{task.status}</span><span className="task-stage">{task.stage}</span><span className="task-progress-percent">{task.progress}%</span></div>
          <progress aria-label="Conversion progress" value={task.progress} max={100} />
          {task.error_message && <p className="error" role="alert">{task.error_message}</p>}
          <div className="actions compact-actions">
            {canPause(task.status) && <Button variant="secondary" size="sm" onClick={() => control('pause')}>Pause</Button>}
            {canResume(task.status) && <Button variant="secondary" size="sm" onClick={() => control('resume')}>Resume</Button>}
            {canRetry(task.status) && <Button variant="secondary" size="sm" onClick={() => control('retry')}>Retry</Button>}
            {canCancel(task.status) && <Button className="danger" size="sm" onClick={() => control('cancel')}>Cancel</Button>}
            {completedAudio && <Button asChild size="sm"><a href={completedAudio.audio_url}>Play audio</a></Button>}
            <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
          </div>
        </div>}

        {editableText && task && ['pending', 'paused', 'failed'].includes(task.status) && <div className="panel-section">
          <h3>Edit extracted text</h3>
          <textarea value={editableText} onChange={(e) => setEditableText(e.target.value)} rows={8} />
          <Button variant="secondary" size="sm" onClick={saveText}>Save & regenerate</Button>
        </div>}

        {task?.segments && task.segments.length > 0 && <details className="panel-section segments-details"><summary>Bilingual text ({task.segments.length})</summary><div className="segment-list">{task.segments.map((segment) => <div key={segment.index} className="segment"><strong>{segment.index}</strong><p>{segment.english}</p><p>{segment.chinese}</p></div>)}</div></details>}
      </aside>
    </section>
  );
}
