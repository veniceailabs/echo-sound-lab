/**
 * KeyboardShortcutOverlay — Press ? to show, Escape to dismiss
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { group: 'Playback', items: [
    { key: 'Space', desc: 'Play / Pause' },
    { key: 'K', desc: 'Play / Pause (alt)' },
    { key: 'J', desc: 'Rewind 10s' },
    { key: 'L', desc: 'Forward 10s' },
    { key: '←', desc: 'Back 5s' },
    { key: '→', desc: 'Forward 5s' },
    { key: 'Shift + ←', desc: 'Back 10s' },
    { key: 'Shift + →', desc: 'Forward 10s' },
  ]},
  { group: 'Studio', items: [
    { key: 'M', desc: 'Mute / Unmute' },
    { key: 'A', desc: 'Toggle A/B compare' },
    { key: 'Cmd + Z', desc: 'Undo' },
    { key: 'Cmd + Shift + Z', desc: 'Redo' },
    { key: 'E', desc: 'Open Echo AI chat' },
    { key: '?', desc: 'Show this overlay' },
    { key: 'Escape', desc: 'Close overlays' },
  ]},
];

export const KeyboardShortcutOverlay: React.FC<Props> = ({ isOpen, onClose }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.94, y: 8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={e => e.stopPropagation()}
          className="bg-slate-950/95 border border-white/[0.08] rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.8)] p-6 w-full max-w-md"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Keyboard Shortcuts</h2>
              <p className="text-[10px] text-slate-600 mt-0.5">Pro workflow controls</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-5">
            {SHORTCUTS.map(group => (
              <div key={group.group}>
                <p className="text-[9px] text-slate-600 uppercase tracking-[0.2em] font-semibold mb-2">{group.group}</p>
                <div className="space-y-1.5">
                  {group.items.map(({ key, desc }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{desc}</span>
                      <kbd className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[10px] text-slate-400 font-mono">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-700 text-center mt-5">Press <kbd className="text-slate-600 font-mono">Esc</kbd> or click outside to close</p>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
