import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import type { AppSettings, SettingsUpdatePayload } from '../api/types';

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
  audio_retention_days: undefined,
};

type SettingsContextType = {
  settings: AppSettings;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  loadSettings: () => Promise<AppSettings>;
  updateSettings: (payload: SettingsUpdatePayload) => Promise<AppSettings>;
  clearServerCache: () => Promise<void>;
  loading: boolean;
  error: string;
  setError: (err: string) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode; unlocked: boolean }> = ({ children, unlocked }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('theme_dark') === 'true';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = async (): Promise<AppSettings> => {
    setLoading(true);
    try {
      const data = await api<AppSettings>('/api/settings');
      const loaded = { ...defaultSettings, ...data };
      setSettings(loaded);
      setIsDark(Boolean(loaded.dark_mode));
      return loaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load settings';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlocked) {
      loadSettings().catch(() => undefined);
    }
  }, [unlocked]);

  // Sync classList for dark mode
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme_dark', 'true');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme_dark', 'false');
    }
  }, [isDark]);

  const updateSettings = async (payload: SettingsUpdatePayload): Promise<AppSettings> => {
    try {
      const saved = await api<AppSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const updated = { ...defaultSettings, ...saved };
      setSettings(updated);
      setIsDark(Boolean(updated.dark_mode));
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update settings';
      setError(msg);
      throw err;
    }
  };

  const clearServerCache = async () => {
    try {
      await api('/api/settings/clear-cache', { method: 'POST' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear cache';
      setError(msg);
      throw err;
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isDark,
        setIsDark,
        loadSettings,
        updateSettings,
        clearServerCache,
        loading,
        error,
        setError,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
};
