import { useEffect, useState } from 'react';
import { Calendar, Headphones, Play, Pause, Trash2, Clock, FileText, Edit2 } from 'lucide-react';
import { api } from '../api/client';
import type { AudioFile } from '../api/types';
import { Button } from './ui/button';

type MediaPaneProps = {
  activeAudio: AudioFile | null;
  onSelectAudio: (audio: AudioFile) => void;
  t: (key: any) => string;
};

export default function MediaPane({ activeAudio, onSelectAudio, t }: MediaPaneProps) {
  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [error, setError] = useState('');
  const [editingAudioId, setEditingAudioId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [playerIsPlaying, setPlayerIsPlaying] = useState(false);

  async function load() {
    try {
      setAudios(await api('/api/audios'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('noAudioFound'));
    }
  }

  useEffect(() => {
    load();
  }, [activeAudio?.id]);

  // Sync player playing state
  useEffect(() => {
    const handlePlay = () => setPlayerIsPlaying(true);
    const handlePause = () => setPlayerIsPlaying(false);

    window.addEventListener('player-play', handlePlay);
    window.addEventListener('player-pause', handlePause);

    return () => {
      window.removeEventListener('player-play', handlePlay);
      window.removeEventListener('player-pause', handlePause);
    };
  }, []);

  async function remove(audio: AudioFile, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t('deleteConfirmAudio'))) return;
    try {
      await api(`/api/audios/${audio.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteAudioFailed'));
    }
  }

  function startEdit(audio: AudioFile, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingAudioId(audio.id);
    setEditingTitle(audio.title);
  }

  async function saveRename(audio: AudioFile) {
    if (!editingTitle.trim()) {
      setEditingAudioId(null);
      return;
    }
    if (editingTitle.trim() === audio.title) {
      setEditingAudioId(null);
      return;
    }
    try {
      await api<AudioFile>(`/api/audios/${audio.id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      setEditingAudioId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('renameAudioFailed'));
    }
  }

  function formatDuration(secs?: number) {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function translateAudioMode(mode: string) {
    if (mode === 'bilingual') return t('bilingual');
    if (mode === 'english') return t('englishOnly');
    if (mode === 'chinese') return t('chineseOnly');
    return mode;
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {error && <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg">{error}</div>}

      <div className="flex-1 overflow-y-auto pr-1">
        <div className="pdf-list-grid">
          {audios.map((audio) => {
            const isActive = activeAudio?.id === audio.id;
            const isCurrentPlaying = isActive && playerIsPlaying;
            return (
              <div
                key={audio.id}
                className={`pdf-card ${isActive ? 'is-selected' : ''}`}
              >
                <div className="pdf-card-info">
                  <div className="pdf-card-icon">
                    <Headphones size={16} />
                  </div>
                  <div className="pdf-meta-text flex-1">
                    {editingAudioId === audio.id ? (
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => saveRename(audio)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(audio);
                          if (e.key === 'Escape') setEditingAudioId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="text-xs h-7 py-0 px-2 w-full font-semibold border border-ring focus:ring-1 focus:ring-ring rounded bg-card"
                      />
                    ) : (
                      <span
                        className="pdf-title"
                        onDoubleClick={(e) => startEdit(audio, e)}
                        title="Double-click to rename"
                      >
                        {audio.title}
                      </span>
                    )}
                    <div className="pdf-meta-row">
                      {audio.source_pdf_name && (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <FileText size={10} />
                            {audio.source_pdf_name.replace(/\.pdf$/i, '')}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      {audio.page_expression && (
                        <>
                          <span>{t('pageRange')}: {audio.page_expression}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{translateAudioMode(audio.audio_mode)}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} />
                        {formatDuration(audio.duration)}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(audio.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pdf-card-actions" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={(e) => startEdit(audio, e)}
                    title="Rename Audio"
                  >
                    <Edit2 size={13} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant={isActive ? 'default' : 'secondary'}
                    size="sm"
                    className="flex items-center gap-1 text-[11px]"
                    onClick={() => {
                      if (isActive) {
                        window.dispatchEvent(new CustomEvent('player-toggle-play'));
                      } else {
                        onSelectAudio(audio);
                      }
                    }}
                  >
                    {isCurrentPlaying ? (
                      <>
                        <Pause size={12} fill="currentColor" />
                        <span>{t('pause')}</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} fill="currentColor" />
                        <span>{t('play')}</span>
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={(e) => remove(audio, e)}
                    aria-label={`Delete ${audio.title}`}
                  >
                    <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}

          {audios.length === 0 && (
            <div className="empty-state p-8 text-center text-muted-foreground">
              <Headphones size={32} className="mx-auto opacity-40 mb-2" />
              <h3 className="font-bold text-sm">{t('noAudioFound')}</h3>
              <p className="text-xs">{t('noAudioHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
