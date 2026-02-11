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

  waveform: string;
}

// Default English translations embedded to ensure synchronous availability
const DEFAULT_TRANSLATIONS: TranslationKeys = {
  appName: "Echo Sound Lab",
  loading: "Loading...",
  error: "Error",
  success: "Success",
  settings: {
    title: "Settings",
    language: "Language",
    languageDesc: "Choose your preferred language",
    systemDefault: "System Default",
    theme: "Theme",
    themeDesc: "Choose your color theme"
  },
  controls: {
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    upload: "Upload Audio",
    export: "Export",
    process: "Process",
    analyze: "Analyze Mix"
  },
  processing: {
    analyzing: "Analyzing audio...",
    processing: "Processing...",
    rendering: "Rendering final mix...",
    complete: "Processing complete",
    failed: "Processing failed"
  },
  meters: {
    lufs: "LUFS",
    peak: "Peak",
    rms: "RMS",
    phaseCorrelation: "Phase Correlation",
    stereoWidth: "Stereo Width",
    truePeak: "True Peak"
  },
  report: {
    title: "Echo Report",
    generating: "Generating report...",
    verdict: "Verdict",
    suggestions: "Suggestions",
    share: "Share",
    download: "Download Report"
  },
  modes: {
    single: "Single Track",
    multi: "Stems",
    reference: "Reference Matching",
    ai: "AI Studio"
  },
  upload: {
    title: "Upload Your Track",
    description: "Drop your audio file to begin mixing & mastering",
    analyzingAudio: "Analyzing Audio",
    extractingMetrics: "Extracting metrics and signatures..."
  },
  session: {
    restoreTitle: "Restore Session?",
    previousFound: "Previous session found:",
    mode: "Mode",
    suggestionsApplied: "suggestions applied",
    restoreNote: "Your DSP settings will be restored. You'll need to re-upload the audio file.",
    startFresh: "Start Fresh",
    restore: "Restore"
  },
  ab: {
    noChanges: "A/B (No Changes)",
    original: "A (Original)",
    processed: "B (Processed)"
  },
  waveform: "Waveform"
};

class I18nService {
  private currentLanguage: SupportedLanguage = 'en';
  private translations: Map<SupportedLanguage, TranslationKeys> = new Map();
  private fallbackLanguage: SupportedLanguage = 'en';

  constructor() {
    // Pre-load default English translations synchronously to prevent FOUC (keys showing)
    this.translations.set('en', DEFAULT_TRANSLATIONS);
    this.detectAndSetLanguage();
  }

  /**
   * Detect user's preferred language from browser/system
   */
  private detectLanguage(): SupportedLanguage {
    const stored = localStorage.getItem('echo-language') as SupportedLanguage;
    if (stored && this.isSupported(stored)) {
      return stored;
    }

    // Check browser language
    const browserLang = navigator.language.toLowerCase();

    // Map browser language codes to supported languages
    const langMap: Record<string, SupportedLanguage> = {
      'en': 'en', 'en-us': 'en', 'en-gb': 'en',
      'es': 'es', 'es-es': 'es', 'es-mx': 'es',
      'th': 'th', 'th-th': 'th',
      'fr': 'fr', 'fr-fr': 'fr',
      'de': 'de', 'de-de': 'de',
      'ja': 'ja', 'ja-jp': 'ja',
      'ko': 'ko', 'ko-kr': 'ko',
      'zh': 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
      'pt': 'pt', 'pt-br': 'pt', 'pt-pt': 'pt',
      'ar': 'ar', 'ar-sa': 'ar'
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
   * Initialize and set language
   */
  private async detectAndSetLanguage() {
    const lang = this.detectLanguage();
    await this.setLanguage(lang);
  }

  /**
   * Load translation file dynamically
   */
  private async loadTranslation(lang: SupportedLanguage): Promise<TranslationKeys> {
    if (this.translations.has(lang)) {
      return this.translations.get(lang)!;
    }

    try {
      // Fetch JSON file (browser-compatible)
      const response = await fetch(`/src/locales/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${lang}.json: ${response.statusText}`);
      }

      const translations = await response.json();
      this.translations.set(lang, translations);
      return translations;
    } catch (error) {
      console.warn(`Failed to load ${lang} translations, falling back to ${this.fallbackLanguage}`);

      // Load fallback if not already loaded
      if (!this.translations.has(this.fallbackLanguage)) {
        // Fallback to embedded defaults if fetch fails for fallback too
        this.translations.set(this.fallbackLanguage, DEFAULT_TRANSLATIONS);
      }

      return this.translations.get(this.fallbackLanguage)!;
    }
  }

  /**
   * Set current language
   */
  async setLanguage(lang: SupportedLanguage): Promise<void> {
    this.currentLanguage = lang;
    await this.loadTranslation(lang);
    localStorage.setItem('echo-language', lang);

    // Update HTML lang attribute for accessibility
    document.documentElement.lang = lang;

    // Dispatch event so React components can re-render
    window.dispatchEvent(new Event('languageChanged'));
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
    const translations = this.translations.get(this.currentLanguage);
    if (!translations) return keyPath;

    const keys = keyPath.split('.');
    let value: any = translations;

    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) {
        console.warn(`Translation key not found: ${keyPath}`);
        return keyPath;
      }
    }

    return typeof value === 'string' ? value : keyPath;
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
}

export const i18nService = new I18nService();
