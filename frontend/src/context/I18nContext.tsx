import React, { createContext, useContext, useState } from 'react';
import { translations, Language, TranslationKey } from '../i18n';

type I18nContextType = {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language') as Language;
    if (saved === 'zh' || saved === 'en') return saved;
    // Auto-detect browser language
    const browserLang = navigator.language.substring(0, 2);
    return browserLang === 'zh' ? 'zh' : 'en';
  });

  const onLanguageChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('app-language', newLang);
  };

  const t = (key: TranslationKey): string => {
    return translations[lang]?.[key] || translations['en']?.[key] || String(key);
  };

  return (
    <I18nContext.Provider value={{ lang, onLanguageChange, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useT = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useT must be used within I18nProvider');
  return context;
};
