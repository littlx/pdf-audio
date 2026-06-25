import { useEffect, useState } from 'react';
import type { PdfFile } from '../api/types';
import { api } from '../api/client';

export default function PdfPreviewPage({ pdf, convertSelection }: { pdf: PdfFile; convertSelection: (text: string) => void }) {
  const [page, setPage] = useState(pdf.last_preview_page || 1);
  const [outline, setOutline] = useState<{ level: number; title: string; page: number }[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    api<{ level: number; title: string; page: number }[]>(`/api/pdfs/${pdf.id}/outline`).then(setOutline).catch(() => setOutline([]));
  }, [pdf.id]);

  useEffect(() => {
    api(`/api/pdfs/${pdf.id}/last-page`, { method: 'PATCH', body: JSON.stringify({ page }) }).catch(() => undefined);
  }, [page]);

  function captureSelection() {
    const text = window.getSelection()?.toString().trim() || '';
    setSelected(text);
  }

  const fileUrl = `/api/pdfs/${pdf.id}/file`;

  return (
    <section className="page preview-page" onMouseUp={captureSelection}>
      <div className="toolbar">
        <h2>{pdf.original_name}</h2>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} / {pdf.page_count}</span>
        <button disabled={page >= pdf.page_count} onClick={() => setPage(page + 1)}>Next</button>
        <input className="small" type="number" min={1} max={pdf.page_count} value={page} onChange={(e) => setPage(Number(e.target.value))} />
        {selected && <button onClick={() => convertSelection(selected)}>Convert selected text</button>}
      </div>
      <div className="preview-layout">
        <aside className="card outline">
          <h3>Table of contents</h3>
          {outline.length === 0 && <p>No embedded TOC.</p>}
          {outline.map((item, idx) => (
            <button key={idx} className="toc-item" style={{ paddingLeft: `${item.level * 10}px` }} onClick={() => setPage(item.page)}>{item.title}</button>
          ))}
        </aside>
        <div className="pdf-frame card">
          <object data={`${fileUrl}#page=${page}`} type="application/pdf" width="100%" height="720">
            <p>PDF preview is not available. <a href={fileUrl}>Open PDF</a></p>
          </object>
          <p className="hint">Use the browser PDF text layer to select and copy text. If selection is unavailable, open the PDF in a new tab.</p>
        </div>
      </div>
    </section>
  );
}
