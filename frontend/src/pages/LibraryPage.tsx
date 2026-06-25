import { useEffect, useState } from 'react';
import { BookOpen, Calendar, FileText, Play, Search, Sparkles, Trash2, UploadCloud, Wand2 } from 'lucide-react';
import { api } from '../api/client';
import type { PdfFile } from '../api/types';
import { Button } from '@/components/ui/button';

const coverThemes = ['coral', 'yellow', 'teal', 'slate', 'rose', 'amber'];

function shortTitle(name: string) {
  return name.replace(/\.pdf$/i, '').trim();
}

function initials(name: string) {
  return shortTitle(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'PDF';
}

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
    <section className="page library-page">
      <div className="section-heading dashboard-heading">
        <h2>My PDF books</h2>
        <div className="library-controls">
          <label className="inline-search">
            <Search size={16} />
            <input placeholder="Search filename" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="uploaded_at">Upload time</option>
            <option value="author">Author</option>
          </select>
          <Button size="sm" onClick={load}>Search</Button>
        </div>
      </div>

      <label className="dropzone book-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) upload(file).catch((err) => setError(err.message)); }}>
        <input hidden type="file" accept="application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file).catch((err) => setError(err.message)); }} />
        <span className="dropzone-icon"><UploadCloud size={20} /></span>
        <span>
          <strong>Drop a PDF here or click to upload</strong>
          <small>Max 200MB · Convert books into bilingual audio plans</small>
        </span>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="book-grid">
        {pdfs.map((pdf, index) => {
          const title = shortTitle(pdf.original_name);
          return (
            <div className="library-book-card" key={pdf.id}>
              <div className={`book-cover cover-${coverThemes[index % coverThemes.length]}`}>
                <span>{initials(pdf.original_name)}</span>
                <BookOpen size={26} strokeWidth={2.15} />
              </div>
              <div className="book-info">
                <div className="book-title-row">
                  <h3>{title}</h3>
                  <Button variant="ghost" size="iconSm" aria-label={`Delete ${title}`} onClick={() => remove(pdf)}><Trash2 size={15} /></Button>
                </div>
                <p className="muted">{pdf.author || 'Unknown author'}</p>
                <div className="book-meta-row">
                  <span><FileText size={13} /> {pdf.page_count} pages</span>
                  <span><Calendar size={13} /> {new Date(pdf.uploaded_at).toLocaleDateString()}</span>
                  <span>{(pdf.file_size / 1024 / 1024).toFixed(1)} MB</span>
                  <span className={`status-badge is-${pdf.status.toLowerCase()}`}>{pdf.status}</span>
                </div>
                <div className="actions card-actions">
                  <Button variant="secondary" size="sm" onClick={() => openPreview(pdf)}><Play size={14} /> Preview</Button>
                  <Button size="sm" onClick={() => openConvert(pdf)}><Wand2 size={14} /> Convert</Button>
                </div>
              </div>
            </div>
          );
        })}
        {pdfs.length === 0 && (
          <div className="empty-state">
            <Sparkles size={26} />
            <h3>No PDFs yet</h3>
            <p>Upload a book to build your audio catalog.</p>
          </div>
        )}
      </div>
    </section>
  );
}
