import { useEffect, useState, useRef } from 'react';
import { Cpu, Palette, Save, Volume2, X } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings, SettingsUpdatePayload, TtsVoice } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';
import { useSettings } from '../context/SettingsContext';
import LanguageToggle from './LanguageToggle';

type SettingsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { t, lang } = useT();
  const {
    settings,
    loadSettings,
    updateSettings,
    clearServerCache,
    error,
    setError,
  } = useSettings();

  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [message, setMessage] = useState('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;
    loadSettings().catch(() => undefined);
    
    api<TtsVoice[]>('/api/settings/tts-voices')
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [isOpen]);

  const setSettingsField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  function buildPayload(): SettingsUpdatePayload {
    // Exclude read-only/masked API key fields from settings spread
    const { ai_api_key_configured, ai_api_key_masked, ...rest } = localSettings;
    const payload: SettingsUpdatePayload = { ...rest };
    if (apiKeyInput.trim()) {
      payload.ai_api_key = apiKeyInput.trim();
    }
    return payload;
  }

  async function save() {
    setError('');
    setMessage('');
    try {
      await updateSettings(buildPayload());
      setApiKeyInput('');
      setMessage(t('settingsSaved'));
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  }

  async function handleClearCache() {
    setError('');
    setMessage('');
    try {
      await clearServerCache();
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
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      const voice = lang === 'english' ? localSettings.english_voice : localSettings.chinese_voice;
      const response = await api<Response>('/api/settings/tts-preview', {
        method: 'POST',
        body: JSON.stringify({ lang, voice }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
      };
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
                  value={localSettings.ai_base_url}
                  onChange={(e) => setSettingsField('ai_base_url', e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </div>
              <div className="form-group">
                <label>{t('apiKey')}</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  placeholder={localSettings.ai_api_key_masked || t('leaveBlankToKeepKey')}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t('modelName')}</label>
                <input
                  value={localSettings.ai_model}
                  onChange={(e) => setSettingsField('ai_model', e.target.value)}
                  placeholder="deepseek-v4-flash"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('format')}</label>
                  <select
                    value={localSettings.default_bilingual_format}
                    onChange={(e) => setSettingsField('default_bilingual_format', e.target.value as AppSettings['default_bilingual_format'])}
                  >
                    <option value="sentence_pair">{t('sentencePair')}</option>
                    <option value="paragraph_pair">{t('paragraphPair')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('translationStyle')}</label>
                  <select
                    value={localSettings.default_output_style}
                    onChange={(e) => setSettingsField('default_output_style', e.target.value as AppSettings['default_output_style'])}
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
                  value={localSettings.english_voice}
                  onChange={(e) => setSettingsField('english_voice', e.target.value)}
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
                  value={localSettings.chinese_voice}
                  onChange={(e) => setSettingsField('chinese_voice', e.target.value)}
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
                  <input value={localSettings.english_rate} onChange={(e) => setSettingsField('english_rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('chineseRate')}</label>
                  <input value={localSettings.chinese_rate} onChange={(e) => setSettingsField('chinese_rate', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('englishVolume')}</label>
                  <input value={localSettings.english_volume} onChange={(e) => setSettingsField('english_volume', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('chineseVolume')}</label>
                  <input value={localSettings.chinese_volume} onChange={(e) => setSettingsField('chinese_volume', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="form-group">
                  <label>{t('langPause')}</label>
                  <input
                    type="number"
                    value={localSettings.pause_between_languages_ms}
                    onChange={(e) => setSettingsField('pause_between_languages_ms', Number(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>{t('segmentPause')}</label>
                  <input
                    type="number"
                    value={localSettings.pause_between_segments_ms}
                    onChange={(e) => setSettingsField('pause_between_segments_ms', Number(e.target.value))}
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
                <LanguageToggle size="sm" />
              </div>

              <div className="flex items-center justify-between">
                <label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  {t('enableDark')}
                </label>
                <input
                  type="checkbox"
                  checked={localSettings.dark_mode}
                  onChange={(e) => setSettingsField('dark_mode', e.target.checked)}
                  className="w-4 h-4 accent-ring cursor-pointer"
                />
              </div>

              <div className="form-group">
                <label>{t('subFontSize')}</label>
                <select
                  value={localSettings.subtitle_font_size}
                  onChange={(e) => setSettingsField('subtitle_font_size', e.target.value as AppSettings['subtitle_font_size'])}
                >
                  <option value="small">{lang === 'zh' ? '小' : 'Small'}</option>
                  <option value="medium">{lang === 'zh' ? '中' : 'Medium'}</option>
                  <option value="large">{lang === 'zh' ? '大' : 'Large'}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('subAccentColor')}</label>
                <input
                  value={localSettings.subtitle_color}
                  onChange={(e) => setSettingsField('subtitle_color', e.target.value)}
                  placeholder="default"
                />
              </div>

              <div className="mt-1">
                <label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  {t('serverCache')}
                </label>
                <Button variant="secondary" size="sm" className="w-full" onClick={handleClearCache}>
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
