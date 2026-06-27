import { useEffect, useState, useCallback } from 'react';
import { Calendar, FileText, Search, Trash2, UploadCloud, Wand2, Eye, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import type { PdfFile } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import EditableTitle from './EditableTitle';

function shortTitle(name: string) {
  return name.replace(/\.pdf$/i, '').trim();
}

type LibraryPaneProps = {
  onSelectPdf: (pdf: PdfFile) => void;
  onOpenConvert: (pdf: PdfFile) => void;
  activePdfId?: string;
};

export default function LibraryPane({ onSelectPdf, onOpenConvert, activePdfId }: LibraryPaneProps) {
  const { t } = useT();
  const { toast, confirm } = useToast();
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState('uploaded_at');
  const [uploading, setUploading] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PdfFile[]>(`/api/pdfs?keyword=${encodeURIComponent(searchQuery)}&sort=${sort}`);
      setPdfs(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('deletePdfFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sort, t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearchSubmit = () => {
    setSearchQuery(keywordInput);
  };

  async function upload(file: File) {
    setUploading(file.name);
    const form = new FormData();
    form.append('file', file);
    try {
      const uploaded = await api<PdfFile>('/api/pdfs', { method: 'POST', body: form });
      toast(`${t('uploadPdf')}: ${uploaded.original_name}.`, 'success');
      await load();
      onSelectPdf(uploaded);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('renamePdfFailed'), 'error');
    } finally {
      setUploading('');
    }
  }

  async function remove(pdf: PdfFile, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm(t('deleteConfirmPdf'));
    if (!ok) return;
    try {
      await api(`/api/pdfs/${pdf.id}`, { method: 'DELETE' });
      toast(t('pdfDeletedSuccess'), 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('deletePdfFailed'), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Filters Toolbar */}
      <div className="library-filters">
        <div className="search-input-wrapper">
          <Search size={14} />
          <input
            placeholder={t('searchInLibrary')}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="uploaded_at">{t('uploadDate')}</option>
          <option value="file_size">{t('fileSize')}</option>
          <option value="original_name">{t('name')}</option>
        </select>
        <Button size="sm" variant="secondary" onClick={handleSearchSubmit}>
          {t('search')}
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
        {uploading ? (
          <Loader2 size={24} className="text-ring animate-spin" />
        ) : (
          <UploadCloud size={24} className="text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground text-center px-4">
          {uploading ? `${t('uploadPdf')} ${uploading}…` : t('dragDropPdf')}
        </span>
      </label>

      {/* Document Card List */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="pdf-list-grid">
          {loading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="pdf-card animate-pulse border border-border/50">
                <div className="pdf-card-info flex-1">
                  <div className="w-8 h-8 rounded bg-secondary flex-shrink-0" />
                  <div className="flex-1 flex flex-col gap-2 pl-3">
                    <div className="h-4 bg-secondary rounded w-2/3" />
                    <div className="h-3 bg-secondary rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))
          ) : (
            pdfs.map((pdf) => {
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
                      <EditableTitle
                        initialTitle={shortTitle(pdf.original_name)}
                        onSave={async (newTitle) => {
                          const newName = newTitle + '.pdf';
                          if (newName === pdf.original_name) return;
                          await api<PdfFile>(`/api/pdfs/${pdf.id}/rename`, {
                            method: 'PATCH',
                            body: JSON.stringify({ original_name: newName }),
                          });
                          toast(t('renameSuccess'), 'success');
                          await load();
                        }}
                      />
                      <div className="pdf-meta-row">
                        <span>{pdf.page_count} {t('pages')}</span>
                        <span>·</span>
                        <span>{(pdf.file_size / 1024 / 1024).toFixed(1)} MB</span>
                        <span className="hide-on-mobile">·</span>
                        <span className="hide-on-mobile">{pdf.author || 'Unknown Author'}</span>
                        <span className="hide-on-mobile">·</span>
                        <span className="inline-flex items-center gap-1 hide-on-mobile">
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
                      onClick={() => onSelectPdf(pdf)}
                      title="Read PDF"
                    >
                      <Eye size={14} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex items-center gap-1 text-[11px] pdf-convert-btn-adaptive"
                      onClick={() => onOpenConvert(pdf)}
                    >
                      <Wand2 size={12} />
                      <span className="hide-on-mobile">{t('convertPdf')}</span>
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
            })
          )}

          {!loading && pdfs.length === 0 && (
            <div className="empty-state p-8 text-center text-muted-foreground">
              <FileText size={32} className="mx-auto opacity-40 mb-2" />
              <h3 className="font-bold text-sm">{t('noPdfFound')}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
