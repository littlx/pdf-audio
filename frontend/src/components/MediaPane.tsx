import { useEffect, useState, useMemo } from 'react';
import { Calendar, Headphones, Play, Pause, Trash2, Clock, FileText, X, Copy, Loader2, Search } from 'lucide-react';
import { api } from '../api/client';
import type { AudioFile, SubtitleEntry } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { formatTime } from '../lib/utils';
import EditableTitle from './EditableTitle';

export default function MediaPane() {
  const { t } = useT();
  const { activeAudio, setActiveAudio, isPlaying, setIsPlaying, togglePlay, setSeekTime } = usePlayer();
  const { toast, confirm } = useToast();

  const [audios, setAudios] = useState<AudioFile[]>([]);
  const [error, setError] = useState('');

  // Subtitle in-place viewing states
  const [expandedAudioId, setExpandedAudioId] = useState<string | null>(null);
  const [viewingSubs, setViewingSubs] = useState<SubtitleEntry[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subQuery, setSubQuery] = useState('');

  // Load subtitles for the expanded audio card
  useEffect(() => {
    if (!expandedAudioId) {
      setViewingSubs([]);
      setSubQuery('');
      return;
    }
    let isCurrent = true;
    setLoadingSubs(true);
    api<SubtitleEntry[]>(`/api/audios/${expandedAudioId}/subtitles.json`)
      .then((data) => {
        if (isCurrent) setViewingSubs(data || []);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Failed to load subtitles', 'error');
      })
      .finally(() => {
        if (isCurrent) setLoadingSubs(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [expandedAudioId, toast]);

  // Group subtitles by index and filter by query
  const groupedSubs = useMemo(() => {
    const groups = new Map<number, { english?: string; chinese?: string; start: number }>();
    viewingSubs.forEach((entry) => {
      const g = groups.get(entry.segment_index) || { start: entry.start };
      if (entry.lang === 'english') g.english = entry.text;
      if (entry.lang === 'chinese') g.chinese = entry.text;
      if (entry.start < g.start) g.start = entry.start;
      groups.set(entry.segment_index, g);
    });
    const list = Array.from(groups.entries()).map(([index, val]) => ({
      index,
      english: val.english || '',
      chinese: val.chinese || '',
      start: val.start,
    }));
    
    if (!subQuery) return list;
    const q = subQuery.toLowerCase();
    return list.filter(item => 
      item.english.toLowerCase().includes(q) || 
      item.chinese.toLowerCase().includes(q)
    );
  }, [viewingSubs, subQuery]);

  const handlePlaySentence = (audio: AudioFile, start: number) => {
    if (activeAudio?.id !== audio.id) {
      setActiveAudio(audio);
    }
    setSeekTime(start);
  };

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
            const isExpanded = expandedAudioId === audio.id;
            return (
              <div
                key={audio.id}
                className={`pdf-card flex-col items-stretch ${isActive ? 'is-selected' : ''}`}
              >
                {/* Card Top Row */}
                <div className="flex items-center justify-between w-full gap-2" onClick={(e) => e.stopPropagation()}>
                  <div className="pdf-card-info flex-1 min-w-0">
                    <div className="pdf-card-icon">
                      <Headphones size={16} />
                    </div>
                    <div className="pdf-meta-text flex-1 min-w-0">
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
                            <span className="inline-flex items-center gap-1 pdf-source-name min-w-0 max-w-[150px] sm:max-w-[260px] md:max-w-[360px] hide-on-mobile">
                              <FileText size={10} className="flex-shrink-0" />
                              <span className="truncate">{audio.source_pdf_name.replace(/\.pdf$/i, '')}</span>
                            </span>
                            <span className="hide-on-mobile">·</span>
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
                        <span className="hide-on-mobile">·</span>
                        <span className="inline-flex items-center gap-1 hide-on-mobile">
                          <Calendar size={10} />
                          {new Date(audio.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pdf-card-actions shrink-0">
                    <Button
                      variant={isActive ? 'default' : 'secondary'}
                      size="sm"
                      className="flex items-center gap-1 text-[11px] pdf-convert-btn-adaptive"
                      onClick={() => {
                        if (isActive) {
                          togglePlay();
                        } else {
                          setActiveAudio(audio);
                        }
                      }}
                    >
                      {isCurrentPlaying ? (
                        <Pause size={12} fill="currentColor" />
                      ) : (
                        <Play size={12} fill="currentColor" />
                      )}
                      <span className="hide-on-mobile">{isCurrentPlaying ? t('pause') : t('play')}</span>
                    </Button>
                    <Button
                      variant={isExpanded ? 'secondary' : 'ghost'}
                      size="iconSm"
                      onClick={() => setExpandedAudioId(isExpanded ? null : audio.id)}
                      title={t('viewBilingualText')}
                      aria-label={`View bilingual text for ${audio.title}`}
                    >
                      <FileText size={14} className={isExpanded ? 'text-foreground' : 'text-muted-foreground'} />
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

                {/* In-place Expanded Bilingual Text */}
                {isExpanded && (
                  <div className="border border-border/40 mt-3 flex flex-col gap-2 min-h-0 bg-card rounded-lg p-2.5" onClick={(e) => e.stopPropagation()}>
                    {/* Search bar inside card */}
                    <div className="search-input-wrapper" style={{ height: '32px', borderRadius: '6px', padding: '0 8px', flex: 'none', background: 'var(--card)' }}>
                      <Search size={11} className="text-muted-foreground/60 shrink-0" />
                      <input
                        placeholder={t('searchTranscripts') || 'Search...'}
                        value={subQuery}
                        onChange={(e) => setSubQuery(e.target.value)}
                        style={{ fontSize: '11px' }}
                      />
                      {subQuery && (
                        <button onClick={() => setSubQuery('')} className="search-clear-btn">
                          <X size={8} />
                        </button>
                      )}
                    </div>

                    <div className="max-h-[250px] overflow-y-auto pr-2 flex flex-col gap-3 scrollbar-thin mt-1">
                      {loadingSubs ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-6">
                          <Loader2 className="animate-spin text-muted-foreground" size={16} />
                          <span className="text-[10px] text-muted-foreground">{t('loading') || 'Loading...'}</span>
                        </div>
                      ) : groupedSubs.length > 0 ? (
                        groupedSubs.map((item) => (
                          <div
                            key={item.index}
                            className="flex items-center gap-3 relative group pr-7 pl-1 py-1.5 hover:bg-muted/20 rounded transition-colors"
                          >
                            {/* Centered serial number or play icon button on hover */}
                            <button
                              type="button"
                              className="w-5 flex justify-end shrink-0 select-none cursor-pointer p-0 border-none bg-transparent text-muted-foreground/60 hover:text-primary focus:outline-none"
                              onClick={() => handlePlaySentence(audio, item.start)}
                              title={t('play') || 'Play'}
                            >
                              <span className="text-[9px] font-bold font-mono group-hover:hidden">
                                {String(item.index).padStart(2, '0')}
                              </span>
                              <Play size={10} className="text-primary hidden group-hover:block fill-current" />
                            </button>

                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              {item.english && <p className="text-sm text-foreground font-medium leading-relaxed">{item.english}</p>}
                              {item.chinese && <p className="text-[13px] text-foreground/85 leading-relaxed">{item.chinese}</p>}
                            </div>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              className="absolute right-0.5 opacity-0 group-hover:opacity-100 transition-opacity top-1/2 -translate-y-1/2"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(`${item.english}\n${item.chinese}`);
                                toast(t('copySuccess') || 'Copied', 'success');
                              }}
                              title={t('copyText') || 'Copy'}
                            >
                              <Copy size={10} className="text-muted-foreground" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-muted-foreground text-[10px]">
                          {t('noMatchingSubtitles') || 'No matching transcripts found'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
