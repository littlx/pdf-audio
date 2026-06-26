import { useEffect, useState } from 'react';
import { Calendar, FileText, Play, Search, Trash2, UploadCloud, Wand2 } from 'lucide-react';
import { api } from '../api/client';
import type { PdfFile } from '../api/types';
import { Button } from '@/components/ui/button';

function shortTitle(name: string) {
  return name.replace(/\.pdf$/i, '').trim();
}

export default function LibraryPage({ openConvert, openPreview }: { openConvert: (pdf: PdfFile) => void; openPreview: (pdf: PdfFile) => void }) {
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('uploaded_at');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState('');

  async function load() {
    try {
      setPdfs(await api(`/api/pdfs?keyword=${encodeURIComponent(keyword)}&sort=${sort}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDFs');
    }
  }

  useEffect(() => { load(); }, [sort]);

  async function upload(file: File) {
    setError('');
    setMessage('');
    setUploading(file.name);
    const form = new FormData();
    form.append('file', file);
    try {
      const uploaded = await api<PdfFile>('/api/pdfs', { method: 'POST', body: form });
      setMessage(`Uploaded ${uploaded.original_name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload PDF');
    } finally {
      setUploading('');
    }
  }

  async function remove(pdf: PdfFile) {
    if (!confirm(`Delete PDF "${pdf.original_name}"? Generated audios will be kept.`)) return;
    await api(`/api/pdfs/${pdf.id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <section className="page library-page compact-page">
      <div className="compact-toolbar">
        <div>
          <h2>Library</h2>
          <p>{pdfs.length} PDFs · upload, preview, convert</p>
        </div>
        <label className="inline-search compact-search">
          <Search size={15} />
          <input placeholder="Search filename" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="uploaded_at">Upload time</option>
          <option value="author">Author</option>
        </select>
        <Button size="sm" variant="secondary" onClick={load}>Search</Button>
        <label className="upload-button">
          <input hidden type="file" accept="application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }} />
          <UploadCloud size={14} /> {uploading ? 'Uploading…' : 'Upload PDF'}
        </label>
      </div>

      <label className="dropzone compact-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) upload(file); }}>
        Drop PDF here · max 200MB
      </label>

      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="document-table">
        <div className="document-row document-head">
          <span>File</span><span>Author</span><span>Pages</span><span>Size</span><span>Uploaded</span><span>Status</span><span>Actions</span>
        </div>
        {pdfs.map((pdf) => (
          <div className="document-row" key={pdf.id}>
            <div className="doc-title"><FileText size={15} /><strong>{shortTitle(pdf.original_name)}</strong></div>
            <span className="muted truncate">{pdf.author || 'Unknown'}</span>
            <span>{pdf.page_count}</span>
            <span>{(pdf.file_size / 1024 / 1024).toFixed(1)} MB</span>
            <span className="muted"><Calendar size={12} /> {new Date(pdf.uploaded_at).toLocaleDateString()}</span>
            <span className={`status-badge is-${pdf.status.toLowerCase()}`}>{pdf.status}</span>
            <div className="row-actions">
              <Button variant="secondary" size="sm" onClick={() => openPreview(pdf)}><Play size={13} /> Preview</Button>
              <Button size="sm" onClick={() => openConvert(pdf)}><Wand2 size={13} /> Convert</Button>
              <Button variant="ghost" size="iconSm" aria-label={`Delete ${pdf.original_name}`} onClick={() => remove(pdf)}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}
        {pdfs.length === 0 && <div className="empty-state table-empty"><h3>No PDFs yet</h3><p>Upload a PDF to start converting.</p></div>}
      </div>
    </section>
  );
}
