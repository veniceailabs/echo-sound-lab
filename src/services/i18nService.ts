/**
 * Internationalization (i18n) Service
 * Handles language detection, loading, and translation
 */

export type SupportedLanguage = 'en' | 'es' | 'th' | 'fr' | 'de' | 'ja' | 'ko' | 'zh' | 'pt' | 'ar';

export interface TranslationKeys {
  // App-wide
  appName: string;
  loading: string;
  error: string;
  success: string;

  // Settings
  settings: {
    title: string;
    language: string;
    languageDesc: string;
    systemDefault: string;
    theme: string;
    themeDesc: string;
  };

  // Audio controls
  controls: {
    play: string;
    pause: string;
    stop: string;
    upload: string;
    export: string;
    process: string;
    analyze: string;
  };

  // Processing
  processing: {
    analyzing: string;
    processing: string;
    rendering: string;
    complete: string;
    failed: string;
  };

  // Meters & Analysis
  meters: {
    lufs: string;
    peak: string;
    rms: string;
    phaseCorrelation: string;
    stereoWidth: string;
    truePeak: string;
  };

  // Echo Report
  report: {
    title: string;
    generating: string;
    verdict: string;
    suggestions: string;
    share: string;
    download: string;
  };

  // Modes
  modes: {
    single: string;
    multi: string;
    reference: string;
    ai: string;
  };

  // Upload screen
  upload: {
    title: string;
    description: string;
    analyzingAudio: string;
    extractingMetrics: string;
  };

  // Session restore
  session: {
    restoreTitle: string;
    previousFound: string;
    mode: string;
    suggestionsApplied: string;
    restoreNote: string;
    startFresh: string;
    restore: string;
  };

  // A/B testing
  ab: {
    noChanges: string;
    original: string;
    processed: string;
  };

  // Settings panel
  settingsPanel: {
    studioControls: string;
    sectionMode: string;
    sectionDisplay: string;
    sectionLanguage: string;
    sectionNetwork: string;
    sectionAbout: string;
    show: string;
    hide: string;
    friendlyModeTitle: string;
    friendlyModeSubtitle: string;
    advancedModeTitle: string;
    advancedModeSubtitle: string;
    switchToAdvanced: string;
    switchToFriendly: string;
    resetToOriginal: string;
    reducedMotion: string;
    highContrast: string;
    largeTouchTargets: string;
    dark: string;
    light: string;
    ssid: string;
    proxyGateway: string;
    useLocalNetwork: string;
    localNetwork: string;
    routingNote: string;
    aboutHeadline: string;
    aboutLine1: string;
    aboutLine2: string;
    aboutLine3: string;
    aboutLine4: string;
    betaTools: string;
    copyDebugInfo: string;
    copied: string;
    copyFailed: string;
    clearLog: string;
    debugHint: string;
    version: string;
  };

  // App shell
  app: {
    videoMode: string;
    settingsButton: string;
    networkShort: string;
    networkLocalShort: string;
    returnToApp: string;
  };

  waveform: string;
}

// Default English translations embedded to ensure synchronous availability
const DEFAULT_TRANSLATIONS: TranslationKeys = {
  appName: 'Echo Sound Lab',
  loading: 'Loading...',
  error: 'Error',
  success: 'Success',
  settings: {
    title: 'Settings',
    language: 'Language',
    languageDesc: 'Choose your preferred language',
    systemDefault: 'System Default',
    theme: 'Theme',
    themeDesc: 'Choose your color theme'
  },
  controls: {
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    upload: 'Upload Audio',
    export: 'Export',
    process: 'Process',
    analyze: 'Analyze Mix'
  },
  processing: {
    analyzing: 'Analyzing audio...',
    processing: 'Processing...',
    rendering: 'Rendering final mix...',
    complete: 'Processing complete',
    failed: 'Processing failed'
  },
  meters: {
    lufs: 'LUFS',
    peak: 'Peak',
    rms: 'RMS',
    phaseCorrelation: 'Phase Correlation',
    stereoWidth: 'Stereo Width',
    truePeak: 'True Peak'
  },
  report: {
    title: 'Echo Report',
    generating: 'Generating report...',
    verdict: 'Verdict',
    suggestions: 'Suggestions',
    share: 'Share',
    download: 'Download Report'
  },
  modes: {
    single: 'Single Track',
    multi: 'Stems',
    reference: 'Reference Matching',
    ai: 'AI Studio'
  },
  upload: {
    title: 'Upload Your Track',
    description: 'Drop your audio file to begin mixing & mastering',
    analyzingAudio: 'Analyzing Audio',
    extractingMetrics: 'Extracting metrics and signatures...'
  },
  session: {
    restoreTitle: 'Restore Session?',
    previousFound: 'Previous session found:',
    mode: 'Mode',
    suggestionsApplied: 'suggestions applied',
    restoreNote: "Your DSP settings will be restored. You'll need to re-upload the audio file.",
    startFresh: 'Start Fresh',
    restore: 'Restore'
  },
  ab: {
    noChanges: 'A/B (No Changes)',
    original: 'A (Original)',
    processed: 'B (Processed)'
  },
  settingsPanel: {
    studioControls: 'Studio Controls',
    sectionMode: 'Mode',
    sectionDisplay: 'Display',
    sectionLanguage: 'Language',
    sectionNetwork: 'Network',
    sectionAbout: 'About',
    show: 'Show',
    hide: 'Hide',
    friendlyModeTitle: 'Friendly mode',
    friendlyModeSubtitle: 'Simplified controls with guided steps',
    advancedModeTitle: 'Advanced mode',
    advancedModeSubtitle: 'Full plugin rack, EQ, and meters',
    switchToAdvanced: 'Switch to Advanced',
    switchToFriendly: 'Switch to Friendly',
    resetToOriginal: 'Reset to original',
    reducedMotion: 'Reduced motion',
    highContrast: 'High contrast mode',
    largeTouchTargets: 'Larger touch targets',
    dark: 'Dark',
    light: 'Light',
    ssid: 'SSID',
    proxyGateway: 'Proxy / Gateway',
    useLocalNetwork: 'Use local network (no proxy)',
    localNetwork: 'Local network',
    routingNote: 'These values are saved locally to help studio analytic routing and diagnostics only.',
    aboutHeadline: 'Restraint > Expansion',
    aboutLine1: 'We protect your sound before we ever change it.',
    aboutLine2: 'No audio is altered unless you ask.',
    aboutLine3: 'Always let you compare your original.',
    aboutLine4: 'Silence is success. Restraint is power.',
    betaTools: 'Beta Tools',
    copyDebugInfo: 'Copy Debug Info',
    copied: 'Copied',
    copyFailed: 'Copy Failed',
    clearLog: 'Clear Log',
    debugHint: 'If something breaks, tap Copy Debug Info and paste it into your beta reply email.',
    version: 'Version'
  },
  app: {
    videoMode: 'SFS Video Engine',
    settingsButton: 'Settings',
    networkShort: 'Net',
    networkLocalShort: 'Local',
    returnToApp: 'Return to Echo Sound Lab'
  },
  waveform: 'Waveform'
};

const LOCALE_LOADERS: Record<SupportedLanguage, () => Promise<Partial<TranslationKeys>>> = {
  en: async () => (await import('../locales/en.json')).default as Partial<TranslationKeys>,
  es: async () => (await import('../locales/es.json')).default as Partial<TranslationKeys>,
  th: async () => (await import('../locales/th.json')).default as Partial<TranslationKeys>,
  fr: async () => (await import('../locales/fr.json')).default as Partial<TranslationKeys>,
  de: async () => (await import('../locales/de.json')).default as Partial<TranslationKeys>,
  ja: async () => (await import('../locales/ja.json')).default as Partial<TranslationKeys>,
  ko: async () => (await import('../locales/ko.json')).default as Partial<TranslationKeys>,
  zh: async () => (await import('../locales/zh.json')).default as Partial<TranslationKeys>,
  pt: async () => (await import('../locales/pt.json')).default as Partial<TranslationKeys>,
  ar: async () => (await import('../locales/ar.json')).default as Partial<TranslationKeys>,
};

class I18nService {
  private currentLanguage: SupportedLanguage = 'en';
  private translations: Map<SupportedLanguage, TranslationKeys> = new Map();
  private fallbackLanguage: SupportedLanguage = 'en';
  private initialized = false;
  private initializationPromise: Promise<SupportedLanguage> | null = null;

  constructor() {
    // Pre-load default English translations synchronously to prevent FOUC (keys showing).
    this.translations.set('en', DEFAULT_TRANSLATIONS);
  }

  /**
   * Initialize language from stored/browser preference once.
   */
  async initialize(): Promise<SupportedLanguage> {
    if (this.initialized) {
      return this.currentLanguage;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const detected = this.detectLanguage();
      await this.setLanguage(detected);
      this.initialized = true;
      return this.currentLanguage;
    })();

    try {
      return await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Detect user's preferred language from browser/system
   */
  private detectLanguage(): SupportedLanguage {
    try {
      const stored = localStorage.getItem('echo-language') as SupportedLanguage | null;
      if (stored && this.isSupported(stored)) {
        return stored;
      }
    } catch (error) {
      console.warn('[i18n] Failed reading stored language preference', error);
    }

    if (typeof navigator === 'undefined') {
      return this.fallbackLanguage;
    }

    // Check browser language
    const browserLang = navigator.language.toLowerCase();

    // Map browser language codes to supported languages
    const langMap: Record<string, SupportedLanguage> = {
      en: 'en', 'en-us': 'en', 'en-gb': 'en',
      es: 'es', 'es-es': 'es', 'es-mx': 'es',
      th: 'th', 'th-th': 'th',
      fr: 'fr', 'fr-fr': 'fr',
      de: 'de', 'de-de': 'de',
      ja: 'ja', 'ja-jp': 'ja',
      ko: 'ko', 'ko-kr': 'ko',
      zh: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
      pt: 'pt', 'pt-br': 'pt', 'pt-pt': 'pt',
      ar: 'ar', 'ar-sa': 'ar'
    };

    const detected = langMap[browserLang] || langMap[browserLang.split('-')[0]];
    return detected || this.fallbackLanguage;
  }

  /**
   * Check if language code is supported
   */
  private isSupported(lang: string): lang is SupportedLanguage {
    return ['en', 'es', 'th', 'fr', 'de', 'ja', 'ko', 'zh', 'pt', 'ar'].includes(lang);
  }

  /**
   * Load translation file dynamically
   */
  private async loadTranslation(lang: SupportedLanguage): Promise<TranslationKeys> {
    if (this.translations.has(lang)) {
      return this.translations.get(lang)!;
    }

    try {
      const loadedTranslations = await LOCALE_LOADERS[lang]();
      const mergedTranslations = this.mergeWithDefaults(loadedTranslations);
      this.translations.set(lang, mergedTranslations);
      return mergedTranslations;
    } catch (error) {
      console.warn(`[i18n] Failed to load ${lang} translations; falling back to ${this.fallbackLanguage}`, error);

      if (!this.translations.has(this.fallbackLanguage)) {
        this.translations.set(this.fallbackLanguage, DEFAULT_TRANSLATIONS);
      }
      const fallback = this.translations.get(this.fallbackLanguage)!;
      this.translations.set(lang, fallback);
      return fallback;
    }
  }

  private mergeWithDefaults(translations: Partial<TranslationKeys>): TranslationKeys {
    return {
      ...DEFAULT_TRANSLATIONS,
      ...translations,
      settings: { ...DEFAULT_TRANSLATIONS.settings, ...translations.settings },
      controls: { ...DEFAULT_TRANSLATIONS.controls, ...translations.controls },
      processing: { ...DEFAULT_TRANSLATIONS.processing, ...translations.processing },
      meters: { ...DEFAULT_TRANSLATIONS.meters, ...translations.meters },
      report: { ...DEFAULT_TRANSLATIONS.report, ...translations.report },
      modes: { ...DEFAULT_TRANSLATIONS.modes, ...translations.modes },
      upload: { ...DEFAULT_TRANSLATIONS.upload, ...translations.upload },
      session: { ...DEFAULT_TRANSLATIONS.session, ...translations.session },
      ab: { ...DEFAULT_TRANSLATIONS.ab, ...translations.ab },
      settingsPanel: { ...DEFAULT_TRANSLATIONS.settingsPanel, ...translations.settingsPanel },
      app: { ...DEFAULT_TRANSLATIONS.app, ...translations.app },
    };
  }

  /**
   * Set current language
   */
  async setLanguage(lang: SupportedLanguage): Promise<void> {
    this.currentLanguage = lang;
    await this.loadTranslation(lang);
    this.initialized = true;

    try {
      localStorage.setItem('echo-language', lang);
    } catch (error) {
      console.warn('[i18n] Failed to persist language preference', error);
    }

    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }

  /**
   * Get current language
   */
  getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Get translation by key path (e.g., "settings.title")
   */
  t(keyPath: string): string {
    const primary = this.resolveKey(this.translations.get(this.currentLanguage), keyPath);
    if (primary) return primary;

    const fallback = this.resolveKey(this.translations.get(this.fallbackLanguage), keyPath);
    if (fallback) return fallback;

    return keyPath;
  }

  /**
   * Get all translations for current language
   */
  getTranslations(): TranslationKeys | null {
    return this.translations.get(this.currentLanguage) || null;
  }

  /**
   * Get list of supported languages with native names
   */
  getSupportedLanguages(): Array<{ code: SupportedLanguage; name: string; nativeName: string }> {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'th', name: 'Thai', nativeName: 'ไทย' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' }
    ];
  }

  private resolveKey(source: unknown, keyPath: string): string | null {
    if (!source || typeof source !== 'object') return null;
    const keys = keyPath.split('.');
    let value: unknown = source;

    for (const key of keys) {
      if (!value || typeof value !== 'object') {
        return null;
      }
      value = (value as Record<string, unknown>)[key];
      if (value === undefined) {
        return null;
      }
    }

    return typeof value === 'string' ? value : null;
  }
}

export const i18nService = new I18nService();
