import React from 'react';
import { SubtitleSegmentRow, type SubtitleRowItem } from './SubtitleSegmentRow';

type SubtitleSegmentListProps = {
  items: SubtitleRowItem[];
  activeIndex?: number;
  hideEn?: boolean;
  hideZh?: boolean;
  onPlay?: (start: number) => void;
  activeRef?: React.RefObject<HTMLDivElement | null> | null;
  copyTooltip?: string;
  toast?: (msg: string, type: 'success' | 'error') => void;
  emptyText?: string;
  className?: string;
  rowClassName?: string;
};

export default function SubtitleSegmentList({
  items,
  activeIndex,
  hideEn = false,
  hideZh = false,
  onPlay,
  activeRef,
  copyTooltip,
  toast,
  emptyText = 'No matching subtitles found.',
  className = '',
  rowClassName = '',
}: SubtitleSegmentListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-[10px]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className={`subtitle-segment-list ${className}`}>
      {items.map((item) => {
        const isActive = activeIndex === item.index;
        return (
          <SubtitleSegmentRow
            key={item.index}
            item={item}
            isActive={isActive}
            hideEn={hideEn}
            hideZh={hideZh}
            onPlay={onPlay}
            activeRef={isActive ? activeRef : null}
            copyTooltip={copyTooltip}
            toast={toast}
            className={rowClassName}
          />
        );
      })}
    </div>
  );
}
