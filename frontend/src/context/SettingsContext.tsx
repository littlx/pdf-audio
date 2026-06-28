import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AppSettings, SettingsUpdatePayload } from '../api/types';
import { clearSettingsCache, getSettings, updateSettings as saveSettings } from '../api/settings';
import { defaultSettings } from '../lib/settingsOptions';
import { THEME_DARK_KEY } from '../lib/storageKeys';

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
      return localStorage.getItem(THEME_DARK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = async (): Promise<AppSettings> => {
    setLoading(true);
    try {
      const data = await getSettings();
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
      localStorage.setItem(THEME_DARK_KEY, 'true');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(THEME_DARK_KEY, 'false');
    }
  }, [isDark]);

  const updateSettings = async (payload: SettingsUpdatePayload): Promise<AppSettings> => {
    try {
      const saved = await saveSettings(payload);
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
      await clearSettingsCache();
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
