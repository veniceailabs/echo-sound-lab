import React, { useMemo, useState } from 'react';
import { EngineMode } from '../types';
import { useViewport } from '../context/ViewportContext';
import { useI18n } from '../context/I18nContext';

interface SettingsPanelProps {
  onClose: () => void;
  engineMode: EngineMode;
  setEngineMode: (mode: EngineMode) => void;
  onResetToOriginal: () => void;
  appVersion: string;
  themeMode: 'light' | 'dark';
  setThemeMode: (mode: 'light' | 'dark') => void;
  reducedMotionEnabled: boolean;
  setReducedMotionEnabled: (enabled: boolean) => void;
  highContrastEnabled: boolean;
  setHighContrastEnabled: (enabled: boolean) => void;
  largeTouchTargetsEnabled: boolean;
  setLargeTouchTargetsEnabled: (enabled: boolean) => void;
  networkSettings: { ssid: string; proxy: string; isLocal: boolean };
  setNetworkSettings: (settings: { ssid: string; proxy: string; isLocal: boolean }) => void;
  onCopyDebugInfo?: () => Promise<void>;
  onClearDebugInfo?: () => void;
}

const modeDescriptionKeys: Record<EngineMode, { titleKey: string; subtitleKey: string }> = {
  FRIENDLY: {
    titleKey: 'settingsPanel.friendlyModeTitle',
    subtitleKey: 'settingsPanel.friendlyModeSubtitle',
  },
  ADVANCED: {
    titleKey: 'settingsPanel.advancedModeTitle',
    subtitleKey: 'settingsPanel.advancedModeSubtitle',
  },
};

const sections = ['mode', 'display', 'language', 'network', 'about'] as const;
type SectionKey = (typeof sections)[number];

const sectionIcons: Record<SectionKey, React.ReactNode> = {
  mode: (
    <svg className="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  display: (
    <svg className="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m0-11.314L7.05 7.05m9.9 9.9l1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  ),
  language: (
    <svg className="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m0 4v2m6 4H3m12 0a6 6 0 006 6m0-6a6 6 0 01-6-6" />
    </svg>
  ),
  network: (
    <svg className="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a3 3 0 015.778 0M5.05 12.747a7 7 0 0113.9 0M2 9a11 11 0 0120 0" />
    </svg>
  ),
  about: (
    <svg className="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 20.5a8.5 8.5 0 110-17 8.5 8.5 0 010 17z" />
    </svg>
  ),
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  engineMode,
  setEngineMode,
  onResetToOriginal,
  appVersion,
  themeMode,
  setThemeMode,
  reducedMotionEnabled,
  setReducedMotionEnabled,
  highContrastEnabled,
  setHighContrastEnabled,
  largeTouchTargetsEnabled,
  setLargeTouchTargetsEnabled,
  networkSettings,
  setNetworkSettings,
  onCopyDebugInfo,
  onClearDebugInfo
}) => {
  const { isPhone } = useViewport();
  const { t, language: currentLanguage, setLanguage, supportedLanguages } = useI18n();
  const [isChanging, setIsChanging] = useState(false);
  const [openSection, setOpenSection] = useState<SectionKey | null>('mode');
  const [debugStatus, setDebugStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const sectionTitles = useMemo<Record<SectionKey, string>>(() => ({
    mode: t('settingsPanel.sectionMode'),
    display: t('settingsPanel.sectionDisplay'),
    language: t('settingsPanel.sectionLanguage'),
    network: t('settingsPanel.sectionNetwork'),
    about: t('settingsPanel.sectionAbout'),
  }), [t]);

  const handleLanguageChange = async (lang: (typeof supportedLanguages)[number]['code']) => {
    setIsChanging(true);
    try {
      await setLanguage(lang);
    } finally {
      setIsChanging(false);
    }
  };

  const sectionSummary = (section: SectionKey) => {
    switch (section) {
      case 'mode':
        return engineMode === 'FRIENDLY'
          ? t('settingsPanel.friendlyModeTitle')
          : t('settingsPanel.advancedModeTitle');
      case 'display':
        return themeMode === 'dark' ? t('settingsPanel.dark') : t('settingsPanel.light');
      case 'language': {
        const activeLanguage = supportedLanguages.find(({ code }) => code === currentLanguage);
        return activeLanguage?.nativeName || currentLanguage.toUpperCase();
      }
      case 'network':
        return networkSettings.isLocal ? t('settingsPanel.localNetwork') : (networkSettings.ssid || t('settingsPanel.localNetwork'));
      case 'about':
        return t('settingsPanel.aboutHeadline');
      default:
        return '';
    }
  };

  const handleCopyDebugInfo = async () => {
    if (!onCopyDebugInfo) return;
    setDebugStatus('idle');
    try {
      await onCopyDebugInfo();
      setDebugStatus('copied');
      window.setTimeout(() => setDebugStatus('idle'), 2500);
    } catch (e) {
      console.warn('[SettingsPanel] copyDebugInfo failed', e);
      setDebugStatus('error');
      window.setTimeout(() => setDebugStatus('idle'), 3000);
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-[28px] z-50 flex ${isPhone ? 'items-stretch justify-stretch p-0' : 'items-center justify-center p-4'}`}
    >
      <div
        className={`bg-slate-950/70 backdrop-blur-3xl border border-white/12 shadow-[0_30px_80px_rgba(0,0,0,0.55)] w-full overflow-hidden flex flex-col ${
          isPhone ? 'rounded-none max-w-none h-[100dvh] max-h-none' : 'rounded-3xl max-w-xl max-h-[85vh]'
        }`}
      >
        <div className={`p-5 border-b border-white/10 flex items-center justify-between ${isPhone ? 'pt-[calc(20px+var(--esl-safe-top))]' : ''}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-1">{t('settings.title')}</p>
            <h2 className="text-2xl font-bold text-white">{t('settingsPanel.studioControls')}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`p-4 overflow-y-auto flex-1 min-h-0 ${isPhone ? 'pb-[calc(16px+var(--esl-safe-bottom))]' : ''}`}>
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpenSection(openSection === section ? null : section)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-slate-900/70 border border-white/10 flex items-center justify-center">
                      {sectionIcons[section]}
                    </span>
                    <div>
                      <div className="text-base font-semibold text-white">{sectionTitles[section]}</div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-400">{sectionSummary(section)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">{openSection === section ? t('settingsPanel.hide') : t('settingsPanel.show')}</div>
                </button>
                {openSection === section && (
                  <div className="mt-4 space-y-3">
                    {section === 'mode' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {(Object.keys(modeDescriptionKeys) as EngineMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setEngineMode(mode)}
                              className={`p-3 border rounded-2xl text-left text-sm transition-all ${engineMode === mode
                                ? 'border-orange-400 bg-orange-500/10 text-white shadow-[0_10px_30px_rgba(249,115,22,0.2)]'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/40 hover:bg-white/10'}`}
                            >
                              <div className="font-semibold">{t(modeDescriptionKeys[mode].titleKey)}</div>
                              <p className="text-[11px] text-slate-400">{t(modeDescriptionKeys[mode].subtitleKey)}</p>
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setEngineMode(engineMode === 'FRIENDLY' ? 'ADVANCED' : 'FRIENDLY')}
                            className="flex-1 px-4 py-2 rounded-xl text-xs uppercase tracking-wider font-bold bg-slate-900/60 border border-orange-500/30 text-orange-300 hover:bg-slate-900"
                          >
                            {engineMode === 'FRIENDLY' ? t('settingsPanel.switchToAdvanced') : t('settingsPanel.switchToFriendly')}
                          </button>
                          <button
                            onClick={onResetToOriginal}
                            className="flex-1 px-4 py-2 rounded-xl text-xs uppercase tracking-wider font-bold bg-slate-900/60 border border-slate-700/60 text-slate-200 hover:bg-slate-800"
                          >
                            {t('settingsPanel.resetToOriginal')}
                          </button>
                        </div>
                      </>
                    )}
                    {section === 'display' && (
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          {(['dark', 'light'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setThemeMode(mode)}
                              className={`flex-1 py-3 rounded-2xl border text-sm font-semibold uppercase tracking-wide ${themeMode === mode
                                ? 'bg-orange-500/10 border-orange-400 text-white'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/40 hover:bg-white/10'}`}
                            >
                              {mode === 'dark' ? t('settingsPanel.dark') : t('settingsPanel.light')}
                            </button>
                          ))}
                        </div>

                        <div className="grid gap-2">
                          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
                            <span>{t('settingsPanel.reducedMotion')}</span>
                            <input
                              type="checkbox"
                              checked={reducedMotionEnabled}
                              onChange={(event) => setReducedMotionEnabled(event.target.checked)}
                              className="h-4 w-4 rounded border-white/20 bg-slate-800 text-orange-400"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
                            <span>{t('settingsPanel.highContrast')}</span>
                            <input
                              type="checkbox"
                              checked={highContrastEnabled}
                              onChange={(event) => setHighContrastEnabled(event.target.checked)}
                              className="h-4 w-4 rounded border-white/20 bg-slate-800 text-orange-400"
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
                            <span>{t('settingsPanel.largeTouchTargets')}</span>
                            <input
                              type="checkbox"
                              checked={largeTouchTargetsEnabled}
                              onChange={(event) => setLargeTouchTargetsEnabled(event.target.checked)}
                              className="h-4 w-4 rounded border-white/20 bg-slate-800 text-orange-400"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                    {section === 'language' && (
                      <div className="grid grid-cols-2 gap-3">
                        {supportedLanguages.map(({ code, name, nativeName }) => (
                          <button
                            key={code}
                            onClick={() => handleLanguageChange(code)}
                            disabled={isChanging}
                            className={`p-3 rounded-2xl border transition-all text-left ${currentLanguage === code
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'} ${isChanging ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-white">{nativeName}</div>
                                <div className="text-[11px] text-slate-400">{name}</div>
                              </div>
                              {currentLanguage === code && (
                                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {section === 'network' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500 uppercase tracking-wider">{t('settingsPanel.ssid')}</label>
                          <input
                            type="text"
                            value={networkSettings.ssid}
                            onChange={(e) => setNetworkSettings({ ...networkSettings, ssid: e.target.value })}
                            className="w-full rounded-2xl bg-slate-900/70 border border-white/10 px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-slate-500 uppercase tracking-wider">{t('settingsPanel.proxyGateway')}</label>
                          <input
                            type="text"
                            value={networkSettings.proxy}
                            disabled={networkSettings.isLocal}
                            onChange={(e) => setNetworkSettings({ ...networkSettings, proxy: e.target.value })}
                            className={`w-full rounded-2xl border px-3 py-2 text-sm ${networkSettings.isLocal
                              ? 'bg-slate-900/30 border-white/5 text-slate-500 cursor-not-allowed'
                              : 'bg-slate-900/70 border-white/10 text-white'}`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="local-network"
                            type="checkbox"
                            checked={networkSettings.isLocal}
                            onChange={(e) => setNetworkSettings({ ...networkSettings, isLocal: e.target.checked })}
                            className="h-4 w-4 text-orange-400 bg-slate-800 border border-white/20 rounded focus:ring-orange-500"
                          />
                          <label htmlFor="local-network" className="text-xs uppercase tracking-wider text-slate-400">
                            {t('settingsPanel.useLocalNetwork')}
                          </label>
                        </div>
                        <div className="text-[11px] text-slate-500 italic">
                          {t('settingsPanel.routingNote')}
                        </div>
                      </>
                    )}
                    {section === 'about' && (
                      <div className="text-sm text-slate-300 space-y-2">
                        <p className="text-orange-200 font-semibold text-base">{t('settingsPanel.aboutHeadline')}</p>
                        <p>{t('settingsPanel.aboutLine1')}</p>
                        <p>- {t('settingsPanel.aboutLine2')}</p>
                        <p>- {t('settingsPanel.aboutLine3')}</p>
                        <p>- {t('settingsPanel.aboutLine4')}</p>

                        <div className="pt-3 mt-3 border-t border-white/10 space-y-2">
                          <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('settingsPanel.betaTools')}</p>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              type="button"
                              onClick={handleCopyDebugInfo}
                              disabled={!onCopyDebugInfo}
                              className={`flex-1 px-4 py-2.5 min-h-[44px] rounded-xl text-xs uppercase tracking-wider font-bold transition-all border ${
                                onCopyDebugInfo
                                  ? 'bg-slate-900/60 border-orange-500/30 text-orange-300 hover:bg-slate-900'
                                  : 'bg-white/5 border-white/10 text-slate-600 cursor-not-allowed opacity-60'
                              }`}
                            >
                              {debugStatus === 'copied' ? t('settingsPanel.copied') : debugStatus === 'error' ? t('settingsPanel.copyFailed') : t('settingsPanel.copyDebugInfo')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onClearDebugInfo?.()}
                              disabled={!onClearDebugInfo}
                              className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs uppercase tracking-wider font-bold transition-all border ${
                                onClearDebugInfo
                                  ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                                  : 'bg-white/5 border-white/10 text-slate-600 cursor-not-allowed opacity-60'
                              }`}
                            >
                              {t('settingsPanel.clearLog')}
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {t('settingsPanel.debugHint')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-white/10 bg-white/5">
          <div className="flex justify-between items-center">
            <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">{t('settingsPanel.version')}</div>
            <div className="text-xs text-slate-400 font-mono">{appVersion}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
