import { useEffect, useState } from 'react';
import { Cpu, Palette, Save, Volume2, X } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings, SettingsUpdatePayload, TtsVoice } from '../api/types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

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

import type { Language } from '../i18n';

type SettingsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onThemeChange?: (isDark: boolean) => void;
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  t: (key: any) => string;
};

export default function SettingsDrawer({
  isOpen,
  onClose,
  onThemeChange,
  lang,
  onLanguageChange,
  t,
}: SettingsDrawerProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    api<AppSettings>('/api/settings')
      .then((data) => {
        const loaded = { ...defaultSettings, ...data };
        setSettings(loaded);
        if (onThemeChange) {
          onThemeChange(loaded.dark_mode);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'));
    
    api<TtsVoice[]>('/api/settings/tts-voices')
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [isOpen]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings({ ...settings, [key]: value });
  }

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
      const saved = await api<AppSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(buildPayload()),
      });
      setSettings({ ...defaultSettings, ...saved });
      setApiKeyInput('');
      setMessage(t('settingsSaved'));
      if (onThemeChange) {
        onThemeChange(saved.dark_mode);
      }
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  }

  async function clearCache() {
    setError('');
    setMessage('');
    try {
      await api('/api/settings/clear-cache', { method: 'POST' });
      setMessage(t('cacheCleared'));
      setTimeout(() => setMessage(''), 3000);
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
      const response = await api<Response>('/api/settings/tts-preview', {
        method: 'POST',
        body: JSON.stringify({ lang, voice }),
      });
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

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel" role="dialog" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <h2 id="drawer-title" className="text-base font-bold flex items-center gap-2">
            {t('preferences')}
          </h2>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label={t('close')}>
            <X size={16} />
          </Button>
        </div>

        <div className="drawer-content">
          {message && <div className="p-3 bg-accent text-accent-foreground text-xs font-bold rounded-lg">{message}</div>}
          {error && <div className="p-3 bg-destructive/15 text-destructive text-xs font-bold rounded-lg">{error}</div>}

          {/* AI Settings */}
          <div className="settings-group-card">
            <div className="settings-group-title">
              <Cpu size={14} /> {t('aiSettings')}
            </div>
            <div className="flex flex-col gap-3">
              <div className="form-group">
                <label>{t('apiBaseUrl')}</label>
                <input
                  value={settings.ai_base_url}
                  onChange={(e) => set('ai_base_url', e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </div>
              <div className="form-group">
                <label>{t('apiKey')}</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  placeholder={settings.ai_api_key_masked || t('leaveBlankToKeepKey')}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t('modelName')}</label>
                <input
                  value={settings.ai_model}
                  onChange={(e) => set('ai_model', e.target.value)}
                  placeholder="deepseek-v4-flash"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('format')}</label>
                  <select
                    value={settings.default_bilingual_format}
                    onChange={(e) => set('default_bilingual_format', e.target.value as AppSettings['default_bilingual_format'])}
                  >
                    <option value="sentence_pair">{t('sentencePair')}</option>
                    <option value="paragraph_pair">{t('paragraphPair')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('translationStyle')}</label>
                  <select
                    value={settings.default_output_style}
                    onChange={(e) => set('default_output_style', e.target.value as AppSettings['default_output_style'])}
                  >
                    <option value="faithful">{t('faithful')}</option>
                    <option value="plain_explanation">{t('plainExplanation')}</option>
                    <option value="child_friendly">{t('childFriendly')}</option>
                    <option value="exam_english">{t('examEnglish')}</option>
                    <option value="business_english">{t('businessEnglish')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* TTS Settings */}
          <div className="settings-group-card">
            <div className="settings-group-title">
              <Volume2 size={14} /> {t('ttsSettings')}
            </div>
            <div className="flex flex-col gap-3">
              <div className="form-group">
                <label>{t('englishVoice')}</label>
                <select
                  value={settings.english_voice}
                  onChange={(e) => set('english_voice', e.target.value)}
                  className="text-xs"
                >
                  {(englishVoices.length ? englishVoices : voices).map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voiceLabel(voice)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('chineseVoice')}</label>
                <select
                  value={settings.chinese_voice}
                  onChange={(e) => set('chinese_voice', e.target.value)}
                  className="text-xs"
                >
                  {(chineseVoices.length ? chineseVoices : voices).map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voiceLabel(voice)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('englishRate')}</label>
                  <input value={settings.english_rate} onChange={(e) => set('english_rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('chineseRate')}</label>
                  <input value={settings.chinese_rate} onChange={(e) => set('chinese_rate', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('englishVolume')}</label>
                  <input value={settings.english_volume} onChange={(e) => set('english_volume', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('chineseVolume')}</label>
                  <input value={settings.chinese_volume} onChange={(e) => set('chinese_volume', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('langPause')}</label>
                  <input
                    type="number"
                    value={settings.pause_between_languages_ms}
                    onChange={(e) => set('pause_between_languages_ms', Number(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>{t('segmentPause')}</label>
                  <input
                    type="number"
                    value={settings.pause_between_segments_ms}
                    onChange={(e) => set('pause_between_segments_ms', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-1">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => preview('english')}>
                  {t('testEnglish')}
                </Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => preview('chinese')}>
                  {t('testChinese')}
                </Button>
              </div>
            </div>
          </div>

          {/* Theme & Cache Settings */}
          <div className="settings-group-card">
            <div className="settings-group-title">
              <Palette size={14} /> {t('themeCache')}
            </div>
            <div className="flex flex-col gap-3">
              {/* Language Switcher Switch */}
              <div className="flex items-center justify-between">
                <label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  {t('language')}
                </label>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold transition-colors ${lang === 'zh' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    简体中文
                  </span>
                  <button
                    type="button"
                    onClick={() => onLanguageChange(lang === 'zh' ? 'en' : 'zh')}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
                      lang === 'en' ? 'bg-ring' : 'bg-secondary border border-border'
                    }`}
                    aria-label="Toggle Language"
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-foreground transition-transform duration-200 ${
                        lang === 'en' ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                  <span className={`text-[11px] font-semibold transition-colors ${lang === 'en' ? 'text-foreground' : 'text-muted-foreground'}`}>
                    English
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  {t('enableDark')}
                </label>
                <input
                  type="checkbox"
                  checked={settings.dark_mode}
                  onChange={(e) => set('dark_mode', e.target.checked)}
                  className="w-4 h-4 accent-ring cursor-pointer"
                />
              </div>

              <div className="form-group">
                <label>{t('subFontSize')}</label>
                <select
                  value={settings.subtitle_font_size}
                  onChange={(e) => set('subtitle_font_size', e.target.value as AppSettings['subtitle_font_size'])}
                >
                  <option value="small">{lang === 'zh' ? '小' : 'Small'}</option>
                  <option value="medium">{lang === 'zh' ? '中' : 'Medium'}</option>
                  <option value="large">{lang === 'zh' ? '大' : 'Large'}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('subAccentColor')}</label>
                <input
                  value={settings.subtitle_color}
                  onChange={(e) => set('subtitle_color', e.target.value)}
                  placeholder="default"
                />
              </div>

              <div className="mt-1">
                <label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  {t('serverCache')}
                </label>
                <Button variant="secondary" size="sm" className="w-full" onClick={clearCache}>
                  {t('clearCacheBtn')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" className="btn-primary-gradient" onClick={save}>
            <Save size={14} /> {t('saveSettings')}
          </Button>
        </div>
      </div>
    </>
  );
}
