import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PdfFile, Task } from '../api/types';

export default function ConvertPage({ pdf, selectedText }: { pdf?: PdfFile; selectedText?: string }) {
  const [pageExpression, setPageExpression] = useState('1');
  const [format, setFormat] = useState('sentence_pair');
  const [style, setStyle] = useState('faithful');
  const [audioMode, setAudioMode] = useState('bilingual');
  const [task, setTask] = useState<Task | null>(null);
  const [editableText, setEditableText] = useState(selectedText || '');
  const [error, setError] = useState('');
  const [previewPage, setPreviewPage] = useState(pdf?.last_preview_page || 1);
  const [outline, setOutline] = useState<{ level: number; title: string; page: number }[]>([]);
  const [liveSelection, setLiveSelection] = useState(selectedText || '');

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
    if (text) setLiveSelection(text);
  }

  function goPreviewPage(page: number) {
    if (!pdf) return;
    const nextPage = Math.max(1, Math.min(page, pdf.page_count));
    setPreviewPage(nextPage);
  }

  async function createTask() {
    setError('');
    const useSelectedText = Boolean(liveSelection);
    const payload = useSelectedText
      ? { pdf_id: pdf?.id, input_type: 'selected_text', selected_text: liveSelection, bilingual_format: format, output_style: style, audio_mode: audioMode }
      : { pdf_id: pdf?.id, input_type: 'page_range', page_expression: pageExpression, bilingual_format: format, output_style: style, audio_mode: audioMode };
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
      } catch {}
    }, 2500);
    source.onmessage = (event) => setTask(JSON.parse(event.data));
    return () => { source.close(); clearInterval(timer); };
  }, [task?.id]);

  async function refresh() {
    if (!task) return;
    const data = await api<Task>(`/api/tasks/${task.id}`);
    setTask(data);
    if (data.extracted_text) setEditableText(data.extracted_text);
  }

  async function saveText() {
    if (!task) return;
    await api(`/api/tasks/${task.id}/text`, { method: 'PATCH', body: JSON.stringify({ text: editableText }) });
    await api(`/api/tasks/${task.id}/retry`, { method: 'POST' });
    await refresh();
  }

  async function control(action: 'pause' | 'cancel' | 'resume' | 'retry') {
    if (!task) return;
    await api(`/api/tasks/${task.id}/${action}`, { method: 'POST' });
    await refresh();
  }

  return (
    <section className="page">
      <h2>Convert PDF to Audio</h2>
      {pdf && <p>Source: {pdf.original_name}</p>}
      {liveSelection && <p className="hint">Using selected PDF text. Clear the selected text to use page range instead.</p>}
      <div className="convert-layout" onMouseUp={captureSelection}>
        {pdf && <aside className="card convert-preview">
          <div className="toolbar compact-toolbar">
            <h3>PDF Preview</h3>
          </div>
          {outline.length > 0 && <details className="toc-details"><summary>Table of contents</summary>{outline.map((item, idx) => <button key={idx} className="toc-item" style={{ paddingLeft: `${item.level * 10}px` }} onClick={() => goPreviewPage(item.page)}>{item.title}</button>)}</details>}
          <iframe
            title="PDF preview"
            src={`/api/pdfs/${pdf.id}/file#page=${previewPage}&view=FitH`}
            width="100%"
            height="720"
          />
          <p className="hint">Select text in the PDF preview if your browser allows iframe PDF text selection. You can also <a href={`/api/pdfs/${pdf.id}/file`} target="_blank">open the PDF in a new tab</a>.</p>
        </aside>}
        <main className="convert-main">
      <div className="card form-grid">
        {!liveSelection && <label>Pages<input value={pageExpression} onChange={(e) => setPageExpression(e.target.value)} placeholder="1-3, 5, 8-10" /></label>}
        {liveSelection && <label>Selected text<textarea value={liveSelection} onChange={(e) => setLiveSelection(e.target.value)} rows={5} /><button type="button" onClick={() => setLiveSelection('')}>Clear selected text and use pages</button></label>}
        <label>Format<select value={format} onChange={(e) => setFormat(e.target.value)}><option value="sentence_pair">Sentence pair</option><option value="paragraph_pair">Paragraph pair</option></select></label>
        <label>Style<select value={style} onChange={(e) => setStyle(e.target.value)}><option value="faithful">Faithful</option><option value="plain_explanation">Plain explanation</option><option value="child_friendly">Child-friendly</option><option value="exam_english">Exam English</option><option value="business_english">Business English</option></select></label>
        <label>Audio<select value={audioMode} onChange={(e) => setAudioMode(e.target.value)}><option value="bilingual">Bilingual</option><option value="english">English only</option><option value="chinese">Chinese only</option></select></label>
        <button onClick={createTask}>Start conversion</button>
      </div>
      {error && <p className="error">{error}</p>}
      {task && <div className="card">
        <h3>Task</h3>
        <p>{task.status} · {task.stage} · {task.progress}%</p>
        <progress value={task.progress} max={100} />
        {task.error_message && <p className="error">{task.error_message}</p>}
        <div className="actions"><button onClick={() => control('pause')}>Pause</button><button onClick={() => control('resume')}>Resume</button><button onClick={() => control('retry')}>Retry</button><button className="danger" onClick={() => control('cancel')}>Cancel</button><button onClick={refresh}>Refresh</button></div>
        {editableText && <><h4>Extracted text</h4><textarea value={editableText} onChange={(e) => setEditableText(e.target.value)} rows={10} /><button onClick={saveText}>Save text and regenerate from checkpoint</button></>}
        {task.segments && task.segments.length > 0 && <><h4>Bilingual text</h4>{task.segments.map((s) => <div className="segment" key={s.index}><p>{s.english}</p><p>{s.chinese}</p></div>)}</>}
      </div>}
        </main>
      </div>
    </section>
  );
}
