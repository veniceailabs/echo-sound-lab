import React, { useState, useEffect } from 'react';
import { i18nService, SupportedLanguage } from '../services/i18nService';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(i18nService.getLanguage());
  const [isChanging, setIsChanging] = useState(false);
  const [, forceUpdate] = useState({});
  const languages = i18nService.getSupportedLanguages();

  // Re-render when language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLanguage(i18nService.getLanguage());
      forceUpdate({});
    };
    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    setIsChanging(true);
    await i18nService.setLanguage(lang);
    setCurrentLanguage(lang);
    setIsChanging(false);

    // Trigger re-render of app
    window.dispatchEvent(new Event('languageChanged'));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              {i18nService.t('settings.title')}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">

          {/* Language Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">
              {i18nService.t('settings.language')}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {i18nService.t('settings.languageDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {languages.map(({ code, name, nativeName }) => (
                <button
                  key={code}
                  onClick={() => handleLanguageChange(code)}
                  disabled={isChanging}
                  className={`
                    p-4 rounded-xl border-2 transition-all text-left
                    ${currentLanguage === code
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }
                    ${isChanging ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">{nativeName}</div>
                      <div className="text-xs text-slate-400">{name}</div>
                    </div>
                    {currentLanguage === code && (
                      <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Future sections */}
          <div className="mb-8 opacity-50">
            <h3 className="text-lg font-semibold text-white mb-2">
              {i18nService.t('settings.theme')}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {i18nService.t('settings.themeDesc')}
            </p>
            <div className="text-sm text-slate-500 italic">
              Coming soon...
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/5">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <div>Echo Sound Lab v2.1</div>
            <div>Current: {currentLanguage.toUpperCase()}</div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;
