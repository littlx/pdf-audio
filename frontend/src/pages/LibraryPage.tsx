import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PdfFile } from '../api/types';

export default function LibraryPage({ openConvert, openPreview }: { openConvert: (pdf: PdfFile) => void; openPreview: (pdf: PdfFile) => void }) {
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('uploaded_at');
  const [error, setError] = useState('');

  async function load() {
    try {
      setPdfs(await api(`/api/pdfs?keyword=${encodeURIComponent(keyword)}&sort=${sort}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDFs');
    }
  }

  useEffect(() => { load(); }, [sort]);

  async function upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    await api('/api/pdfs', { method: 'POST', body: form });
    await load();
  }

  async function remove(pdf: PdfFile) {
    if (!confirm(`Delete PDF "${pdf.original_name}"? Generated audios will be kept.`)) return;
    await api(`/api/pdfs/${pdf.id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <section className="page">
      <div className="toolbar">
        <h2>Library</h2>
        <input placeholder="Search filename" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="uploaded_at">Upload time</option>
          <option value="author">Author</option>
        </select>
        <button onClick={load}>Search</button>
      </div>
      <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) upload(file).catch((err) => setError(err.message)); }}>
        <input hidden type="file" accept="application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file).catch((err) => setError(err.message)); }} />
        Drop a PDF here or click to upload. Max 200MB.
      </label>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {pdfs.map((pdf) => (
          <article className="card" key={pdf.id}>
            <h3>{pdf.original_name}</h3>
            <p>{pdf.page_count} pages · {(pdf.file_size / 1024 / 1024).toFixed(1)} MB</p>
            <p>Author: {pdf.author || 'Unknown'}</p>
            <p>Uploaded: {new Date(pdf.uploaded_at).toLocaleString()}</p>
            <div className="actions">
              <button onClick={() => openPreview(pdf)}>Preview</button>
              <button onClick={() => openConvert(pdf)}>Convert</button>
              <button className="danger" onClick={() => remove(pdf)}>Delete PDF</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
