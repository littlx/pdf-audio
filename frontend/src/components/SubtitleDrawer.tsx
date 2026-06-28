import { useEffect, useRef, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { filterSubtitleGroups, groupSubtitles } from '../lib/subtitles';
import SearchInput from './shared/SearchInput';
import SubtitleSegmentList from './subtitles/SubtitleSegmentList';

export default function SubtitleDrawer() {
  const { t } = useT();
  const { toast } = useToast();
  const {
    isSubtitlesOpen,
    setIsSubtitlesOpen,
    subs,
    activeSub,
    setSeekTime,
    hideEn,
    setHideEn,
    hideZh,
    setHideZh,
    dictation,
    setDictation,
  } = usePlayer();

  const [query, setQuery] = useState('');
  const activeItemRef = useRef<HTMLDivElement>(null);

  // Group subtitles
  const groups = useMemo(() => {
    return filterSubtitleGroups(groupSubtitles(subs), query);
  }, [subs, query]);

  const listItems = useMemo(() => {
    return groups.map((g) => ({
      index: g.index,
      english: g.english?.text,
      chinese: g.chinese?.text,
      start: g.english?.start ?? g.chinese?.start ?? 0,
    }));
  }, [groups]);

  // Scroll active segment into view in the drawer
  useEffect(() => {
    if (isSubtitlesOpen && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
      });
    }
  }, [isSubtitlesOpen, activeSub?.segment_index]);

  if (!isSubtitlesOpen) return null;

  return (
    <>
      <div className="subtitle-drawer-backdrop" onClick={() => setIsSubtitlesOpen(false)} />
      <div className="subtitle-drawer-panel" role="dialog" aria-labelledby="sub-drawer-title">
        <div className="subtitle-drawer-header">
          <h2 id="sub-drawer-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('subtitleTranscript')}
          </h2>
          <Button variant="ghost" size="iconSm" onClick={() => setIsSubtitlesOpen(false)} aria-label="Close subtitles">
            <X size={15} />
          </Button>
        </div>

        {/* Filters and Searches */}
        <div className="p-3 border-b border-border flex flex-col gap-2 bg-muted/20">
          <SearchInput
            placeholder={t('searchTranscripts')}
            value={query}
            onChange={setQuery}
            style={{ height: '38px', borderRadius: '8px', padding: '0 12px', flex: 'none' }}
          />
          
          <div className="flex items-center gap-2 mt-1">
            {/* Hide English Pill */}
            <button
              type="button"
              onClick={() => setHideEn(!hideEn)}
              className={`flex-1 py-1.5 px-2 rounded-full border text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer text-center ${
                hideEn
                  ? 'bg-destructive/10 text-destructive border-destructive/30 shadow-sm'
                  : 'bg-muted/30 hover:bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              {t('hideEnglish') || '隐藏英文'}
            </button>

            {/* Hide Chinese Pill */}
            <button
              type="button"
              onClick={() => setHideZh(!hideZh)}
              className={`flex-1 py-1.5 px-2 rounded-full border text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer text-center ${
                hideZh
                  ? 'bg-destructive/10 text-destructive border-destructive/30 shadow-sm'
                  : 'bg-muted/30 hover:bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              {t('hideChinese') || '隐藏中文'}
            </button>

            {/* Dictation Mode Pill */}
            <button
              type="button"
              onClick={() => setDictation(!dictation)}
              className={`flex-1 py-1.5 px-2 rounded-full border text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer text-center ${
                dictation
                  ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                  : 'bg-muted/30 hover:bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              {t('dictationMode') || '听写模式'}
            </button>
          </div>
        </div>

        {/* Segments list */}
        <div className="subtitle-drawer-content">
          <SubtitleSegmentList
            items={listItems}
            activeIndex={activeSub?.segment_index}
            hideEn={hideEn}
            hideZh={hideZh}
            onPlay={setSeekTime}
            activeRef={activeItemRef}
            copyTooltip={t('copyText')}
            toast={toast}
            emptyText={t('noMatchingSubtitles')}
          />
        </div>

        <div className="subtitle-drawer-footer">
          <span>{groups.length} {t('sentences')}</span>
          <span>{t('clickSeek')}</span>
        </div>
      </div>
    </>
  );
}
