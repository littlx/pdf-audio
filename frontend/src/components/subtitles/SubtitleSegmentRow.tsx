import React, { memo } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { formatSubtitlePair } from '../../lib/subtitles';

export type SubtitleRowItem = {
  index: number;
  english?: string;
  chinese?: string;
  start: number;
};

type SubtitleSegmentRowProps = {
  item: SubtitleRowItem;
  isActive?: boolean;
  hideEn?: boolean;
  hideZh?: boolean;
  onPlay?: (start: number) => void;
  activeRef?: React.RefObject<HTMLDivElement | null> | null;
  copyTooltip?: string;
  toast?: (msg: string, type: 'success' | 'error') => void;
  className?: string;
};

export const SubtitleSegmentRow = memo(({
  item,
  isActive = false,
  hideEn = false,
  hideZh = false,
  onPlay,
  activeRef,
  copyTooltip = 'Copy Text',
  toast,
  className = '',
}: SubtitleSegmentRowProps) => {
  return (
    <div
      ref={activeRef}
      className={`subtitle-segment-row ${isActive ? 'is-active' : ''} ${className}`}
      onClick={() => onPlay?.(item.start)}
    >
      <span className="segment-num">
        {String(item.index + 1).padStart(2, '0')}
      </span>
      <div className="subtitle-texts">
        {!hideEn && item.english && <p className="en-text">{item.english}</p>}
        {!hideZh && item.chinese && <p className="zh-text">{item.chinese}</p>}
      </div>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(formatSubtitlePair(item.english, item.chinese));
          toast?.(copyTooltip, 'success');
        }}
        title={copyTooltip}
      >
        <Copy size={12} className="text-muted-foreground" />
      </Button>
    </div>
  );
});

SubtitleSegmentRow.displayName = 'SubtitleSegmentRow';
