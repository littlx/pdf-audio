import type { SubtitleEntry } from '../api/types';

export type SubtitleGroup = {
  index: number;
  english?: SubtitleEntry;
  chinese?: SubtitleEntry;
};

export type SubtitleTextGroup = {
  index: number;
  english: string;
  chinese: string;
  start: number;
};

export function groupSubtitles(entries: SubtitleEntry[]): SubtitleGroup[] {
  const groups = new Map<number, { english?: SubtitleEntry; chinese?: SubtitleEntry }>();
  entries.forEach((entry) => {
    const group = groups.get(entry.segment_index) || {};
    if (entry.lang === 'english') group.english = entry;
    if (entry.lang === 'chinese') group.chinese = entry;
    groups.set(entry.segment_index, group);
  });
  return Array.from(groups.entries()).map(([index, value]) => ({ index, ...value }));
}

export function groupSubtitlesForList(entries: SubtitleEntry[]): SubtitleTextGroup[] {
  const groups = new Map<number, { english?: string; chinese?: string; start: number }>();
  entries.forEach((entry) => {
    const group = groups.get(entry.segment_index) || { start: entry.start };
    if (entry.lang === 'english') group.english = entry.text;
    if (entry.lang === 'chinese') group.chinese = entry.text;
    if (entry.start < group.start) group.start = entry.start;
    groups.set(entry.segment_index, group);
  });
  return Array.from(groups.entries()).map(([index, value]) => ({
    index,
    english: value.english || '',
    chinese: value.chinese || '',
    start: value.start,
  }));
}

export function filterSubtitleGroups<T extends { english?: SubtitleEntry | string; chinese?: SubtitleEntry | string }>(groups: T[], query: string): T[] {
  if (!query) return groups;
  const q = query.toLowerCase();
  return groups.filter((group) => {
    const english = typeof group.english === 'string' ? group.english : group.english?.text || '';
    const chinese = typeof group.chinese === 'string' ? group.chinese : group.chinese?.text || '';
    return english.toLowerCase().includes(q) || chinese.toLowerCase().includes(q);
  });
}

export function findSubtitleIndexAtTime(subs: SubtitleEntry[], time: number): number {
  let low = 0;
  let high = subs.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = subs[mid];
    if (time >= item.start && time <= item.end) {
      return mid;
    }
    if (time < item.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return -1;
}

export function formatSubtitlePair(english?: string, chinese?: string) {
  return `${english || ''}\n${chinese || ''}`;
}
