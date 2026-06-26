import { useEffect, useRef, useState } from 'react';
import { Copy, Search, X } from 'lucide-react';
import type { SubtitleEntry } from '../api/types';
import { Button } from './ui/button';

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

type SubtitleDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  subs: SubtitleEntry[];
  activeSub: SubtitleEntry | null;
  onSeek: (time: number) => void;
  hideEn: boolean;
  hideZh: boolean;
  dictation: boolean;
  setHideEn: (val: boolean) => void;
  setHideZh: (val: boolean) => void;
  setDictation: (val: boolean) => void;
  t: (key: any) => string;
};

export default function SubtitleDrawer({
  isOpen,
  onClose,
  subs,
  activeSub,
  onSeek,
  hideEn,
  hideZh,
  dictation,
  setHideEn,
  setHideZh,
  setDictation,
  t,
}: SubtitleDrawerProps) {
  const [query, setQuery] = useState('');
  const activeItemRef = useRef<HTMLDivElement>(null);

  // Group subtitles
  const groups = groupSubtitles(subs).filter((g) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (g.english?.text || '').toLowerCase().includes(q) ||
      (g.chinese?.text || '').toLowerCase().includes(q)
    );
  });

  // Scroll active segment into view in the drawer
  useEffect(() => {
    if (isOpen && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isOpen, activeSub?.segment_index]);

  if (!isOpen) return null;

  return (
    <>
      <div className="subtitle-drawer-backdrop" onClick={onClose} />
      <div className="subtitle-drawer-panel" role="dialog" aria-labelledby="sub-drawer-title">
        <div className="subtitle-drawer-header">
          <h2 id="sub-drawer-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('subtitleTranscript')}
          </h2>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close subtitles">
            <X size={15} />
          </Button>
        </div>

        {/* Filters and Searches */}
        <div className="p-3 border-b border-border flex flex-col gap-2">
          <div className="search-input-wrapper">
            <Search size={14} />
            <input
              placeholder={t('searchTranscripts')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 text-xs pl-8 w-full"
            />
          </div>
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground cursor-pointer uppercase">
              <input
                type="checkbox"
                checked={hideEn}
                onChange={(e) => setHideEn(e.target.checked)}
                className="w-3.5 h-3.5 accent-ring"
              />
              <span>{t('hideEnglish')}</span>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground cursor-pointer uppercase">
              <input
                type="checkbox"
                checked={hideZh}
                onChange={(e) => setHideZh(e.target.checked)}
                className="w-3.5 h-3.5 accent-ring"
              />
              <span>{t('hideChinese')}</span>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground cursor-pointer uppercase">
              <input
                type="checkbox"
                checked={dictation}
                onChange={(e) => setDictation(e.target.checked)}
                className="w-3.5 h-3.5 accent-ring"
              />
              <span>{t('dictationMode')}</span>
            </label>
          </div>
        </div>

        {/* Segments list */}
        <div className="subtitle-drawer-content">
          {groups.map((group) => {
            const isActive = activeSub?.segment_index === group.index;
            return (
              <div
                key={group.index}
                ref={isActive ? activeItemRef : null}
                className={`subtitle-segment-row ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  const entry = group.english || group.chinese;
                  if (entry) onSeek(entry.start);
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
                  title={t('copyText')}
                >
                  <Copy size={12} className="text-muted-foreground" />
                </Button>
              </div>
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
