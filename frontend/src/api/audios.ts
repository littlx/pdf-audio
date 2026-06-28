import { api } from './client';
import type { AudioFile, SubtitleEntry } from './types';

export type PlaybackRecord = {
  current_time?: number;
  playback_rate?: number;
  loop_current_segment?: boolean;
};

export function listAudios() {
  return api<AudioFile[]>('/api/audios');
}

export function deleteAudio(id: string) {
  return api(`/api/audios/${id}`, { method: 'DELETE' });
}

export function renameAudio(id: string, title: string) {
  return api<AudioFile>(`/api/audios/${id}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function getSubtitles(id: string) {
  return api<SubtitleEntry[]>(`/api/audios/${id}/subtitles.json`);
}

export function getSubtitlesByUrl(url: string) {
  return api<SubtitleEntry[]>(url);
}

export function getPlayback(id: string) {
  return api<PlaybackRecord>(`/api/audios/${id}/playback`);
}

export function savePlayback(id: string, payload: PlaybackRecord) {
  return api(`/api/audios/${id}/playback`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
