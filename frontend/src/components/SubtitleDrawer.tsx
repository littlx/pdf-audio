import { useEffect, useRef, useState, memo, useMemo } from 'react';
import { Copy, Search, X } from 'lucide-react';
import type { SubtitleEntry } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { usePlayer } from '../context/PlayerContext';

function groupSubtitles(entries: SubtitleEntry[]) {
  const groups = new Map<number, { english?: SubtitleEntry; chinese?: SubtitleEntry }>();
  entries.forEach((entry) => {
    const group = groups.get(entry.segment_index) || {};
    if (entry.lang === 'english') group.english = entry;
    if (entry.lang === 'chinese') group.chinese = entry;
    groups.set(entry.segment_index, group);
  });
  return Array.from(groups.entries()).map(([index, value]) => ({ index, ...value }));
}

type SubtitleSegmentRowProps = {
  group: { index: number; english?: SubtitleEntry; chinese?: SubtitleEntry };
  isActive: boolean;
  hideEn: boolean;
  hideZh: boolean;
  setSeekTime: (time: number) => void;
  activeRef: React.RefObject<HTMLDivElement | null> | null;
  copyTooltip: string;
};

const SubtitleSegmentRow = memo(({
  group,
  isActive,
  hideEn,
  hideZh,
  setSeekTime,
  activeRef,
  copyTooltip,
}: SubtitleSegmentRowProps) => {
  return (
    <div
      ref={activeRef}
      className={`subtitle-segment-row ${isActive ? 'is-active' : ''}`}
      onClick={() => {
        const entry = group.english || group.chinese;
        if (entry) setSeekTime(entry.start);
      }}
    >
      <span className="segment-num">
        {String(group.index + 1).padStart(2, '0')}
      </span>
      <div className="subtitle-texts">
        {!hideEn && <p className="en-text">{group.english?.text}</p>}
        {!hideZh && <p className="zh-text">{group.chinese?.text}</p>}
      </div>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(
            `${group.english?.text || ''}\n${group.chinese?.text || ''}`
          );
        }}
        title={copyTooltip}
      >
        <Copy size={12} className="text-muted-foreground" />
      </Button>
    </div>
  );
});

SubtitleSegmentRow.displayName = 'SubtitleSegmentRow';

export default function SubtitleDrawer() {
  const { t } = useT();
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
    return groupSubtitles(subs).filter((g) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        (g.english?.text || '').toLowerCase().includes(q) ||
        (g.chinese?.text || '').toLowerCase().includes(q)
      );
    });
  }, [subs, query]);

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
          <div className="search-input-wrapper" style={{ height: '38px', borderRadius: '8px', padding: '0 12px', flex: 'none' }}>
            <Search size={14} className="text-muted-foreground/60 shrink-0" />
            <input
              placeholder={t('searchTranscripts')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          
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
          {groups.map((group) => {
            const isActive = activeSub?.segment_index === group.index;
            return (
              <SubtitleSegmentRow
                key={group.index}
                group={group}
                isActive={isActive}
                hideEn={hideEn}
                hideZh={hideZh}
                setSeekTime={setSeekTime}
                activeRef={isActive ? activeItemRef : null}
                copyTooltip={t('copyText')}
              />
            );
          })}
          {groups.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">{t('noMatchingSubtitles')}</p>
          )}
        </div>

        <div className="subtitle-drawer-footer">
          <span>{groups.length} {t('sentences')}</span>
          <span>{t('clickSeek')}</span>
        </div>
      </div>
    </>
  );
}
