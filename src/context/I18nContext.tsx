import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { i18nService, SupportedLanguage } from '../services/i18nService';

type SupportedLanguageEntry = ReturnType<typeof i18nService.getSupportedLanguages>[number];

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  t: (keyPath: string) => string;
  supportedLanguages: SupportedLanguageEntry[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(i18nService.getLanguage());

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const initialLanguage = await i18nService.initialize();
      if (mounted) {
        setLanguageState(initialLanguage);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (lang: SupportedLanguage) => {
    await i18nService.setLanguage(lang);
    setLanguageState(i18nService.getLanguage());
  }, []);

  const t = useCallback((keyPath: string) => i18nService.t(keyPath), [language]);

  const supportedLanguages = useMemo(() => i18nService.getSupportedLanguages(), []);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t,
    supportedLanguages,
  }), [language, setLanguage, t, supportedLanguages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
