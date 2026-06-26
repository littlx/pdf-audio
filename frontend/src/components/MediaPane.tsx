import { useEffect, useState } from 'react';
import { Calendar, Headphones, Play, Pause, Trash2, Clock, FileText } from 'lucide-react';
import { api } from '../api/client';
import type { AudioFile } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { formatTime } from '../lib/utils';
import EditableTitle from './EditableTitle';

export default function MediaPane() {
  const { t } = useT();
  const { activeAudio, setActiveAudio, isPlaying, togglePlay } = usePlayer();
  const { toast, confirm } = useToast();

  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [error, setError] = useState('');

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

  async function remove(audio: AudioFile, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm(t('deleteConfirmAudio'));
    if (!ok) return;
    try {
      await api(`/api/audios/${audio.id}`, { method: 'DELETE' });
      toast(t('audioDeletedSuccess'), 'success');
      if (activeAudio?.id === audio.id) {
        setActiveAudio(null);
      }
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('deleteAudioFailed'), 'error');
    }
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
            const isCurrentPlaying = isActive && isPlaying;
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
                    <EditableTitle
                      initialTitle={audio.title}
                      onSave={async (newTitle) => {
                        await api<AudioFile>(`/api/audios/${audio.id}/rename`, {
                          method: 'PATCH',
                          body: JSON.stringify({ title: newTitle }),
                        });
                        toast(t('renameSuccess'), 'success');
                        await load();
                      }}
                    />
                    <div className="pdf-meta-row">
                      {audio.source_pdf_name && (
                        <>
                          <span className="inline-flex items-center gap-1 pdf-source-name min-w-0 max-w-[150px] sm:max-w-[260px] md:max-w-[360px]">
                            <FileText size={10} className="flex-shrink-0" />
                            <span className="truncate">{audio.source_pdf_name.replace(/\.pdf$/i, '')}</span>
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
                        {formatTime(audio.duration)}
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
                    variant={isActive ? 'default' : 'secondary'}
                    size="sm"
                    className="flex items-center gap-1 text-[11px]"
                    onClick={() => {
                      if (isActive) {
                        togglePlay();
                      } else {
                        setActiveAudio(audio);
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
                    <Trash2 size={14} className="text-muted-foreground" />
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
