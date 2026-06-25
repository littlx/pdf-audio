import { useEffect, useState } from 'react';
import { Cpu, Palette, Save, Volume2 } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [voices, setVoices] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<any>('/api/settings').then(setSettings).catch(() => undefined);
    api<any[]>('/api/settings/tts-voices').then(setVoices).catch(() => setVoices([]));
  }, []);

  function set(key: string, value: any) { setSettings({ ...settings, [key]: value }); }

  async function save() {
    const payload = { ...settings };
    delete payload.ai_api_key_masked;
    const saved = await api<any>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    setSettings(saved);
    setMessage('Saved.');
  }

  async function clearCache() {
    await api('/api/settings/clear-cache', { method: 'POST' });
    setMessage('Cache cleared.');
  }

  const englishVoices = voices.filter((voice) => String(voice.locale || '').toLowerCase().startsWith('en'));
  const chineseVoices = voices.filter((voice) => String(voice.locale || '').toLowerCase().startsWith('zh'));

  function voiceLabel(voice: any) {
    return `${voice.name} · ${voice.locale || 'unknown'} · ${voice.gender || 'unknown'}`;
  }

  async function preview(lang: 'english' | 'chinese') {
    const voice = lang === 'english' ? settings.english_voice : settings.chinese_voice;
    const response = await api<Response>('/api/settings/tts-preview', { method: 'POST', body: JSON.stringify({ lang, voice }) });
    const blob = await response.blob();
    new Audio(URL.createObjectURL(blob)).play();
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

      <div className="settings-layout-sections">
        <div className="settings-grid-row">
          <div className="settings-section-card form-grid">
            <h3><Cpu size={16} /> AI Settings</h3>
            <label>API Base URL<input value={settings.ai_base_url || ''} onChange={(e) => set('ai_base_url', e.target.value)} /></label>
            <label>API Key<input type="password" value={settings.ai_api_key || ''} placeholder={settings.ai_api_key_masked || ''} onChange={(e) => set('ai_api_key', e.target.value)} /></label>
            <label>Model<input value={settings.ai_model || ''} onChange={(e) => set('ai_model', e.target.value)} /></label>
            <label>Default format<select value={settings.default_bilingual_format || 'sentence_pair'} onChange={(e) => set('default_bilingual_format', e.target.value)}><option value="sentence_pair">Sentence pair</option><option value="paragraph_pair">Paragraph pair</option></select></label>
            <label>Default style<select value={settings.default_output_style || 'faithful'} onChange={(e) => set('default_output_style', e.target.value)}><option value="faithful">Faithful</option><option value="plain_explanation">Plain explanation</option><option value="child_friendly">Child-friendly</option><option value="exam_english">Exam English</option><option value="business_english">Business English</option></select></label>
          </div>

          <div className="divider-vertical-dashed" />

          <div className="settings-section-card form-grid">
            <h3><Volume2 size={16} /> TTS Settings</h3>
            <label>English voice<select value={settings.english_voice || 'en-US-JennyNeural'} onChange={(e) => set('english_voice', e.target.value)}>
              {(englishVoices.length ? englishVoices : voices).map((voice) => <option key={voice.name} value={voice.name}>{voiceLabel(voice)}</option>)}
            </select></label>
            <label>Chinese voice<select value={settings.chinese_voice || 'zh-CN-XiaoxiaoNeural'} onChange={(e) => set('chinese_voice', e.target.value)}>
              {(chineseVoices.length ? chineseVoices : voices).map((voice) => <option key={voice.name} value={voice.name}>{voiceLabel(voice)}</option>)}
            </select></label>
            <label>English rate<input value={settings.english_rate || '+0%'} onChange={(e) => set('english_rate', e.target.value)} /></label>
            <label>Chinese rate<input value={settings.chinese_rate || '+0%'} onChange={(e) => set('chinese_rate', e.target.value)} /></label>
            <label>English volume<input value={settings.english_volume || '+0%'} onChange={(e) => set('english_volume', e.target.value)} /></label>
            <label>Chinese volume<input value={settings.chinese_volume || '+0%'} onChange={(e) => set('chinese_volume', e.target.value)} /></label>
            <label>Pause between languages ms<input type="number" value={settings.pause_between_languages_ms || 500} onChange={(e) => set('pause_between_languages_ms', Number(e.target.value))} /></label>
            <label>Pause between segments ms<input type="number" value={settings.pause_between_segments_ms || 800} onChange={(e) => set('pause_between_segments_ms', Number(e.target.value))} /></label>
            <div className="actions">
              <Button variant="secondary" onClick={() => preview('english')}>Preview English</Button>
              <Button variant="secondary" onClick={() => preview('chinese')}>Preview Chinese</Button>
            </div>
          </div>
        </div>

        <div className="divider-dashed" />

        <div className="settings-section-card form-grid">
          <h3><Palette size={16} /> Player & Appearance</h3>
          <label>Subtitle font size<select value={settings.subtitle_font_size || 'medium'} onChange={(e) => set('subtitle_font_size', e.target.value)}><option>small</option><option>medium</option><option>large</option></select></label>
          <label>Subtitle color<input value={settings.subtitle_color || 'default'} onChange={(e) => set('subtitle_color', e.target.value)} /></label>
          <label>Server Cache
            <Button variant="secondary" className="btn-form-control" onClick={clearCache}>Clear server cache</Button>
          </label>
        </div>
      </div>
    </section>
  );
}
