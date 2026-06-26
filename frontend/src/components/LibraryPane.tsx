import { useEffect, useState } from 'react';
import { Calendar, FileText, Search, Trash2, UploadCloud, Wand2, Eye, Edit2 } from 'lucide-react';
import { api } from '../api/client';
import type { PdfFile } from '../api/types';
import { Button } from './ui/button';

function shortTitle(name: string) {
  return name.replace(/\.pdf$/i, '').trim();
}

type LibraryPaneProps = {
  onSelectPdf: (pdf: PdfFile) => void;
  onOpenConvert: (pdf: PdfFile) => void;
  activePdfId?: string;
};

export default function LibraryPane({ onSelectPdf, onOpenConvert, activePdfId }: LibraryPaneProps) {
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('uploaded_at');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState('');
  const [editingPdfId, setEditingPdfId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  async function load() {
    try {
      setPdfs(await api(`/api/pdfs?keyword=${encodeURIComponent(keyword)}&sort=${sort}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDFs');
    }
  }

  useEffect(() => {
    load();
  }, [sort]);

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
      // Automatically select the uploaded PDF
      onSelectPdf(uploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload PDF');
    } finally {
      setUploading('');
    }
  }

  async function remove(pdf: PdfFile, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent opening the PDF
    if (!confirm(`Delete PDF "${pdf.original_name}"? Generated audios will be kept.`)) return;
    try {
      await api(`/api/pdfs/${pdf.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete PDF');
    }
  }

  function startEdit(pdf: PdfFile, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingPdfId(pdf.id);
    setEditingName(shortTitle(pdf.original_name));
  }

  async function saveRename(pdf: PdfFile) {
    if (!editingName.trim()) {
      setEditingPdfId(null);
      return;
    }
    const newName = editingName.trim() + '.pdf';
    if (newName === pdf.original_name) {
      setEditingPdfId(null);
      return;
    }
    try {
      await api<PdfFile>(`/api/pdfs/${pdf.id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ original_name: newName }),
      });
      setEditingPdfId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename PDF');
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Filters Toolbar */}
      <div className="library-filters">
        <div className="search-input-wrapper">
          <Search size={14} />
          <input
            placeholder="Search filenames..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="uploaded_at">Upload time</option>
          <option value="author">Author</option>
        </select>
        <Button size="sm" variant="secondary" onClick={load}>
          Search
        </Button>
      </div>

      {/* Combined Drag & Drop + Click Upload Area */}
      <label
        className="dropzone-container"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
      >
        <input
          hidden
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <UploadCloud size={24} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">
          {uploading ? `Uploading ${uploading}…` : 'Drag and drop PDF here, or click to upload (up to 200MB)'}
        </span>
      </label>

      {message && <div className="p-3 bg-accent text-accent-foreground text-xs font-bold rounded-lg">{message}</div>}
      {error && <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg">{error}</div>}

      {/* Document Card List */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="pdf-list-grid">
          {pdfs.map((pdf) => {
            const isSelected = activePdfId === pdf.id;
            return (
              <div
                key={pdf.id}
                className={`pdf-card ${isSelected ? 'is-selected' : ''}`}
              >
                <div className="pdf-card-info">
                  <div className="pdf-card-icon">
                    <FileText size={16} />
                  </div>
                  <div className="pdf-meta-text flex-1">
                    {editingPdfId === pdf.id ? (
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => saveRename(pdf)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(pdf);
                          if (e.key === 'Escape') setEditingPdfId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="text-xs h-7 py-0 px-2 w-full font-semibold border border-ring focus:ring-1 focus:ring-ring rounded bg-card"
                      />
                    ) : (
                      <span
                        className="pdf-title"
                        onDoubleClick={(e) => startEdit(pdf, e)}
                        title="Double-click to rename"
                      >
                        {shortTitle(pdf.original_name)}
                      </span>
                    )}
                    <div className="pdf-meta-row">
                      <span>{pdf.page_count} pages</span>
                      <span>·</span>
                      <span>{(pdf.file_size / 1024 / 1024).toFixed(1)} MB</span>
                      <span>·</span>
                      <span>{pdf.author || 'Unknown Author'}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(pdf.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pdf-card-actions" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={(e) => startEdit(pdf, e)}
                    title="Rename PDF"
                  >
                    <Edit2 size={13} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() => onSelectPdf(pdf)}
                    title="Read PDF"
                  >
                    <Eye size={14} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-1 text-[11px]"
                    onClick={() => onOpenConvert(pdf)}
                  >
                    <Wand2 size={12} />
                    <span>Convert</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={(e) => remove(pdf, e)}
                    aria-label={`Delete ${pdf.original_name}`}
                  >
                    <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          {pdfs.length === 0 && (
            <div className="empty-state p-8 text-center text-muted-foreground">
              <FileText size={32} className="mx-auto opacity-40 mb-2" />
              <h3 className="font-bold text-sm">No PDFs available</h3>
              <p className="text-xs">Upload a PDF file using the dropzone or upload button above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
