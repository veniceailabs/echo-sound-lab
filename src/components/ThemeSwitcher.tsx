import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';

const MODES = [
  { id: 'light', icon: 'L', label: 'Light' },
  { id: 'dark', icon: 'D', label: 'Dark' },
  { id: 'amoled', icon: 'A', label: 'AMOLED' },
] as const;

const SKINS = [
  { id: 'studio', icon: 'ST', label: 'Studio', color: 'from-cyan-500 to-blue-600' },
  { id: 'vinyl', icon: 'VN', label: 'Vinyl', color: 'from-amber-600 to-amber-800' },
  { id: 'neon', icon: 'NE', label: 'Neon', color: 'from-pink-500 to-purple-600' },
  { id: 'minimal', icon: 'MI', label: 'Minimal', color: 'from-gray-400 to-gray-700' },
] as const;

export const ThemeSwitcher: React.FC = () => {
  const { mode, skin, setMode, setSkin } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle('esl-theme-menu-open', isOpen);
    return () => document.documentElement.classList.remove('esl-theme-menu-open');
  }, [isOpen]);

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all border border-white/10 text-[11px] font-semibold uppercase tracking-[0.18em]"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Theme settings"
        aria-label="Theme settings"
      >
        <span className="text-slate-200">Theme</span>
      </motion.button>

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-24px)] p-4 bg-slate-900/95 border border-white/10 rounded-lg shadow-xl backdrop-blur-xl space-y-4 z-50 max-[639px]:fixed max-[639px]:left-3 max-[639px]:right-3 max-[639px]:top-[calc(56px+var(--esl-safe-top,0px))] max-[639px]:mt-0 max-[639px]:w-auto max-[639px]:max-h-[calc(100dvh-88px-var(--esl-safe-top,0px))] max-[639px]:overflow-y-auto"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Theme Mode</p>
              <div className="flex gap-2">
                {MODES.map(m => (
                  <motion.button
                    key={m.id}
                    onClick={() => setMode(m.id as any)}
                    className={`flex-1 min-w-0 px-3 py-2 rounded text-xs font-semibold transition-all ${
                      mode === m.id
                        ? 'bg-cyan-500/40 text-cyan-300 border border-cyan-400/50'
                        : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="flex flex-col items-center justify-center gap-1 leading-none">
                      <span aria-hidden="true">{m.icon}</span>
                      <span className="truncate">{m.label}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Brand Skin</p>
              <div className="grid grid-cols-2 gap-2">
                {SKINS.map(s => (
                  <motion.button
                    key={s.id}
                    onClick={() => setSkin(s.id)}
                    className={`min-w-0 px-3 py-2.5 rounded text-xs font-semibold transition-all ${
                      skin === s.id
                        ? `bg-gradient-to-r ${s.color} text-white border border-white/30`
                        : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="flex items-center justify-center gap-2 leading-none">
                      <span aria-hidden="true">{s.icon}</span>
                      <span className="truncate">{s.label}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center">Click outside to close</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
