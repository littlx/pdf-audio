import { api } from './client';
import type { AppSettings, SettingsUpdatePayload, TtsVoice } from './types';

export function getSettings() {
  return api<AppSettings>('/api/settings');
}

export function updateSettings(payload: SettingsUpdatePayload) {
  return api<AppSettings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function clearSettingsCache() {
  return api('/api/settings/clear-cache', { method: 'POST' });
}

export function getTtsVoices() {
  return api<TtsVoice[]>('/api/settings/tts-voices');
}

export function testAiConnection(payload: { ai_base_url: string; ai_api_key: string; ai_model: string }) {
  return api('/api/settings/test-ai', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewTts(lang: 'english' | 'chinese', voice: string) {
  return api<Response>('/api/settings/tts-preview', {
    method: 'POST',
    body: JSON.stringify({ lang, voice }),
  });
}
