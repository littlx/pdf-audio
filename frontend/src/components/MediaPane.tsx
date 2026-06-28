import { useEffect, useState, useMemo } from 'react';
import { Calendar, Headphones, Play, Pause, Trash2, Clock, FileText, Loader2 } from 'lucide-react';
import { deleteAudio, getSubtitles, listAudios, renameAudio } from '../api/audios';
import type { AudioFile, SubtitleEntry } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { useActiveAudioControls } from '../hooks/useActiveAudioControls';
import { formatTime } from '../lib/utils';
import { filterSubtitleGroups, groupSubtitlesForList } from '../lib/subtitles';
import { translateAudioMode } from '../lib/taskStatus';
import EditableTitle from './EditableTitle';
import SearchInput from './shared/SearchInput';
import EmptyState from './shared/EmptyState';
import SubtitleSegmentList from './subtitles/SubtitleSegmentList';

export default function MediaPane() {
  const { t } = useT();
  const { setSeekTime } = usePlayer();
  const { toast, confirm } = useToast();
  const { activeAudio, playOrToggle, isAudioActive, isAudioPlaying, setActiveAudio } = useActiveAudioControls();

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
    getSubtitles(expandedAudioId)
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
    return filterSubtitleGroups(groupSubtitlesForList(viewingSubs), subQuery);
  }, [viewingSubs, subQuery]);

  const handlePlaySentence = (audio: AudioFile, start: number) => {
    if (activeAudio?.id !== audio.id) {
      setActiveAudio(audio);
    }
    setSeekTime(start);
  };

  async function load() {
    try {
      setAudios(await listAudios());
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
      await deleteAudio(audio.id);
      toast(t('audioDeletedSuccess'), 'success');
      if (activeAudio?.id === audio.id) {
        setActiveAudio(null);
      }
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('deleteAudioFailed'), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {error && <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg">{error}</div>}

      <div className="flex-1 overflow-y-auto pr-1">
        <div className="pdf-list-grid">
          {audios.map((audio) => {
            const isActive = isAudioActive(audio.id);
            const isCurrentPlaying = isAudioPlaying(audio.id);
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
                          await renameAudio(audio.id, newTitle);
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
                        <span>{translateAudioMode(audio.audio_mode, t)}</span>
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
                      onClick={() => playOrToggle(audio)}
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
                    <SearchInput
                      placeholder={t('searchTranscripts') || 'Search...'}
                      value={subQuery}
                      onChange={setSubQuery}
                      onClear={() => setSubQuery('')}
                      style={{ height: '32px', borderRadius: '6px', padding: '0 8px', flex: 'none', background: 'var(--card)' }}
                    />

                    <div className="max-h-[250px] overflow-y-auto pr-2 flex flex-col gap-3 scrollbar-thin mt-1">
                      {loadingSubs ? (
                        <div className="flex flex-col items-center justify-center gap-1 py-6">
                          <Loader2 className="animate-spin text-muted-foreground" size={16} />
                          <span className="text-[10px] text-muted-foreground">{t('loading') || 'Loading...'}</span>
                        </div>
                      ) : (
                        <SubtitleSegmentList
                          items={groupedSubs}
                          onPlay={(start) => handlePlaySentence(audio, start)}
                          copyTooltip={t('copyText') || 'Copy'}
                          toast={toast}
                          emptyText={t('noMatchingSubtitles') || 'No matching transcripts found'}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {audios.length === 0 && (
            <EmptyState
              icon={<Headphones size={32} />}
              title={t('noAudioFound')}
              description={t('noAudioHint')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
