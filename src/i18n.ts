import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

type I18nLanguage = 'en' | 'es' | 'ko';

const localeModules = import.meta.glob('./locales/{en,es,ko}.json', {
  eager: true,
}) as Record<string, { default: Record<string, unknown> }>;

const resources = {
  en: {
    translation: localeModules['./locales/en.json']?.default ?? {},
  },
  es: {
    translation: localeModules['./locales/es.json']?.default ?? {},
  },
  ko: {
    translation: localeModules['./locales/ko.json']?.default ?? {},
  },
};

function normalizeLanguage(value: string | null | undefined): I18nLanguage {
  if (!value) return 'en';
  const lower = value.toLowerCase();
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('ko')) return 'ko';
  return 'en';
}

function resolveInitialLanguage(): I18nLanguage {
  if (typeof window === 'undefined') {
    return 'en';
  }
  const stored = window.localStorage.getItem('echo-language');
  if (stored) {
    return normalizeLanguage(stored);
  }
  return normalizeLanguage(window.navigator.language);
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

  i18n.on('languageChanged', (lang) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('echo-language', normalizeLanguage(lang));
    document.documentElement.lang = normalizeLanguage(lang);
    window.dispatchEvent(new Event('languageChanged'));
  });
}

export default i18n;
