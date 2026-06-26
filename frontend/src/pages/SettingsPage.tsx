import { useEffect, useState } from 'react';
import { Cpu, Palette, Save, Volume2 } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings, SettingsUpdatePayload, TtsVoice } from '../api/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const defaultSettings: AppSettings = {
  ai_base_url: '',
  ai_model: '',
  default_bilingual_format: 'sentence_pair',
  default_output_style: 'faithful',
  english_voice: 'en-US-JennyNeural',
  chinese_voice: 'zh-CN-XiaoxiaoNeural',
  english_rate: '+0%',
  chinese_rate: '+0%',
  english_volume: '+0%',
  chinese_volume: '+0%',
  pause_between_languages_ms: 500,
  pause_between_segments_ms: 800,
  subtitle_font_size: 'medium',
  subtitle_color: 'default',
  dark_mode: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<AppSettings>('/api/settings').then((data) => setSettings({ ...defaultSettings, ...data })).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'));
    api<TtsVoice[]>('/api/settings/tts-voices').then(setVoices).catch(() => setVoices([]));
  }, []);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) { setSettings({ ...settings, [key]: value }); }

  function buildPayload(): SettingsUpdatePayload {
    const payload: SettingsUpdatePayload = {
      ai_base_url: settings.ai_base_url,
      ai_model: settings.ai_model,
      default_bilingual_format: settings.default_bilingual_format,
      default_output_style: settings.default_output_style,
      english_voice: settings.english_voice,
      chinese_voice: settings.chinese_voice,
      english_rate: settings.english_rate,
      chinese_rate: settings.chinese_rate,
      english_volume: settings.english_volume,
      chinese_volume: settings.chinese_volume,
      pause_between_languages_ms: settings.pause_between_languages_ms,
      pause_between_segments_ms: settings.pause_between_segments_ms,
      subtitle_font_size: settings.subtitle_font_size,
      subtitle_color: settings.subtitle_color,
      dark_mode: settings.dark_mode,
    };
    if (apiKeyInput.trim()) payload.ai_api_key = apiKeyInput.trim();
    return payload;
  }

  async function save() {
    setError('');
    setMessage('');
    try {
      const saved = await api<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(buildPayload()) });
      setSettings({ ...defaultSettings, ...saved });
      setApiKeyInput('');
      setMessage('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  }

  async function clearCache() {
    setError('');
    setMessage('');
    try {
      await api('/api/settings/clear-cache', { method: 'POST' });
      setMessage('Cache cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
    }
  }

  const englishVoices = voices.filter((voice) => String(voice.locale || '').toLowerCase().startsWith('en'));
  const chineseVoices = voices.filter((voice) => String(voice.locale || '').toLowerCase().startsWith('zh'));

  function voiceLabel(voice: TtsVoice) {
    return `${voice.name} · ${voice.locale || 'unknown'} · ${voice.gender || 'unknown'}`;
  }

  async function preview(lang: 'english' | 'chinese') {
    setError('');
    try {
      const voice = lang === 'english' ? settings.english_voice : settings.chinese_voice;
      const response = await api<Response>('/api/settings/tts-preview', { method: 'POST', body: JSON.stringify({ lang, voice }) });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview voice');
    }
  }

  return (
    <section className="page settings-page admin-settings-page">
      <div className="settings-hero">
        <div>
          <Badge variant="secondary">System preferences</Badge>
          <h2>Setting</h2>
          <p>Manage AI, voices, cache and subtitle appearance for this workspace.</p>
        </div>
        <Button onClick={save}><Save size={14} /> Save settings</Button>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="settings-layout-sections">
        <div className="settings-grid-row">
          <div className="settings-section-card form-grid">
            <h3><Cpu size={16} /> AI Settings</h3>
            <label>API Base URL<input value={settings.ai_base_url} onChange={(e) => set('ai_base_url', e.target.value)} /></label>
            <label>API Key<input type="password" value={apiKeyInput} placeholder={settings.ai_api_key_masked || 'Leave blank to keep existing key'} onChange={(e) => setApiKeyInput(e.target.value)} /></label>
            <label>Model<input value={settings.ai_model} onChange={(e) => set('ai_model', e.target.value)} /></label>
            <label>Default format<select value={settings.default_bilingual_format} onChange={(e) => set('default_bilingual_format', e.target.value as AppSettings['default_bilingual_format'])}><option value="sentence_pair">Sentence pair</option><option value="paragraph_pair">Paragraph pair</option></select></label>
            <label>Default style<select value={settings.default_output_style} onChange={(e) => set('default_output_style', e.target.value as AppSettings['default_output_style'])}><option value="faithful">Faithful</option><option value="plain_explanation">Plain explanation</option><option value="child_friendly">Child-friendly</option><option value="exam_english">Exam English</option><option value="business_english">Business English</option></select></label>
          </div>

          <div className="divider-vertical-dashed" />

          <div className="settings-section-card form-grid">
            <h3><Volume2 size={16} /> TTS Settings</h3>
            <label>English voice<select value={settings.english_voice} onChange={(e) => set('english_voice', e.target.value)}>
              {(englishVoices.length ? englishVoices : voices).map((voice) => <option key={voice.name} value={voice.name}>{voiceLabel(voice)}</option>)}
            </select></label>
            <label>Chinese voice<select value={settings.chinese_voice} onChange={(e) => set('chinese_voice', e.target.value)}>
              {(chineseVoices.length ? chineseVoices : voices).map((voice) => <option key={voice.name} value={voice.name}>{voiceLabel(voice)}</option>)}
            </select></label>
            <label>English rate<input value={settings.english_rate} onChange={(e) => set('english_rate', e.target.value)} /></label>
            <label>Chinese rate<input value={settings.chinese_rate} onChange={(e) => set('chinese_rate', e.target.value)} /></label>
            <label>English volume<input value={settings.english_volume} onChange={(e) => set('english_volume', e.target.value)} /></label>
            <label>Chinese volume<input value={settings.chinese_volume} onChange={(e) => set('chinese_volume', e.target.value)} /></label>
            <label>Pause between languages ms<input type="number" value={settings.pause_between_languages_ms} onChange={(e) => set('pause_between_languages_ms', Number(e.target.value))} /></label>
            <label>Pause between segments ms<input type="number" value={settings.pause_between_segments_ms} onChange={(e) => set('pause_between_segments_ms', Number(e.target.value))} /></label>
            <div className="actions">
              <Button variant="secondary" onClick={() => preview('english')}>Preview English</Button>
              <Button variant="secondary" onClick={() => preview('chinese')}>Preview Chinese</Button>
            </div>
          </div>
        </div>

        <div className="divider-dashed" />

        <div className="settings-section-card form-grid">
          <h3><Palette size={16} /> Player & Appearance</h3>
          <label>Subtitle font size<select value={settings.subtitle_font_size} onChange={(e) => set('subtitle_font_size', e.target.value as AppSettings['subtitle_font_size'])}><option>small</option><option>medium</option><option>large</option></select></label>
          <label>Subtitle color<input value={settings.subtitle_color} onChange={(e) => set('subtitle_color', e.target.value)} /></label>
          <label>Server Cache
            <Button variant="secondary" className="btn-form-control" onClick={clearCache}>Clear server cache</Button>
          </label>
        </div>
      </div>
    </section>
  );
}
