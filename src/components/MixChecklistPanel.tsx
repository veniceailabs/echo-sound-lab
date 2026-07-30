/**
 * MixChecklistPanel �Pre-mastering quality checklist
 *
 * A structured checklist of the most important things to verify
 * before sending a mix to mastering. Checks are saved per-session.
 *
 * Sections:
 * - Gain staging and headroom
 * - Mix balance (bass, mids, highs)
 * - Stereo field
 * - Dynamics
 * - Technical compliance
 * - Artistic intent
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CheckItem {
  id: string;
  text: string;
  detail: string;
  tool?: string;  // which ESL tool helps with this
}

interface CheckSection {
  title: string;
  emoji: string;
  color: string;
  items: CheckItem[];
}

const SECTIONS: CheckSection[] = [
  {
    title: 'Gain Staging',
    emoji: '📊',
    color: '#22d3ee',
    items: [
      { id: 'gs1', text: 'Mix peaks at -6 dBFS or lower', detail: 'Leave 6 dB of headroom for mastering limiters to work without distortion.', tool: 'Gain Staging Advisor' },
      { id: 'gs2', text: 'No clipping on any individual track', detail: 'Every track should show green on the meters �no red anywhere.', tool: 'Multi-Track Meters' },
      { id: 'gs3', text: 'Bus channel levels feel balanced', detail: 'Drums, bass, instruments, and vocals should each sit at a consistent relative level.', tool: 'Gain Staging Advisor' },
      { id: 'gs4', text: 'Sum channel (mix bus) not over -6 dBFS', detail: 'The combined output of all tracks should leave headroom for mastering.', tool: 'Multi-Track Meters' },
    ],
  },
  {
    title: 'Frequency Balance',
    emoji: '🎚',
    color: '#a855f7',
    items: [
      { id: 'fb1', text: 'Low end is controlled (not muddy)', detail: 'High-pass non-bass elements at 80–100 Hz. Sub should be clean and focused.', tool: 'EQ Advisor' },
      { id: 'fb2', text: 'No harsh 3–5 kHz buildup', detail: 'This range causes ear fatigue. Check for harshness and cut if needed.', tool: 'EQ Advisor' },
      { id: 'fb3', text: 'Air is present (12–16 kHz)', detail: 'A high-shelf presence above 12 kHz makes the mix sound open and modern.', tool: 'Freq Guide' },
      { id: 'fb4', text: 'Kick and bass don\'t fight in 60–120 Hz', detail: 'One should be louder in this range. Use sidechain compression or EQ carving.', tool: 'Spectral Repair' },
    ],
  },
  {
    title: 'Stereo Field',
    emoji: '↔',
    color: '#10b981',
    items: [
      { id: 'sf1', text: 'Phase correlation is positive', detail: 'Negative correlation = phase cancellation. Check with the Stereo Field Analyzer.', tool: 'Stereo Analyzer' },
      { id: 'sf2', text: 'Bass elements are centered (mono)', detail: 'Sub bass below 80 Hz should always be in mono for system compatibility.', tool: 'Stereo Analyzer' },
      { id: 'sf3', text: 'Mix sounds good in mono', detail: 'Click the mono button and make sure nothing disappears or sounds weak.', tool: 'Stereo Analyzer' },
      { id: 'sf4', text: 'Stereo width feels appropriate for genre', detail: 'Ambient/EDM = wide. Rock/jazz = tighter. Check width percentage in the analyzer.', tool: 'Stereo Analyzer' },
    ],
  },
  {
    title: 'Dynamics',
    emoji: '⚡',
    color: '#f59e0b',
    items: [
      { id: 'dyn1', text: 'Mix has adequate dynamic range', detail: 'Aim for >8 dB dynamic range before mastering. Over-compression sounds flat.', tool: 'LUFS Timeline' },
      { id: 'dyn2', text: 'Transients are preserved', detail: 'Drums should have punch and attack. If transients feel mushed, ease off the compressor.', tool: 'Multi-Track Meters' },
      { id: 'dyn3', text: 'Quietest and loudest sections feel intentional', detail: 'Dynamic contrast is artistic. Make sure loud and quiet are both purposeful.', tool: 'LUFS Timeline' },
    ],
  },
  {
    title: 'Technical',
    emoji: '🔧',
    color: '#ef4444',
    items: [
      { id: 'tech1', text: 'No audible noise floor or hum', detail: 'Listen at low volume with no music �silence should be silent.', tool: 'Spectral Repair' },
      { id: 'tech2', text: 'No digital distortion or artifacts', detail: 'Listen for clicks, pops, digital clipping (harsh buzzing). Fix before mastering.', tool: 'Mix Critique' },
      { id: 'tech3', text: 'All edits are seamless (no pops/clicks)', detail: 'Crossfade all cut points. Even a 1-sample gap causes an audible click.', tool: 'Spectral Repair' },
      { id: 'tech4', text: 'Fade in/out applied if needed', detail: 'The track should start and end cleanly, not abruptly.', tool: 'Waveform Trimmer' },
    ],
  },
  {
    title: 'Artistic',
    emoji: '✨',
    color: '#ec4899',
    items: [
      { id: 'art1', text: 'Mix sounds right on multiple speaker systems', detail: 'Check on headphones, small speakers, phone speakers, and in the car.', tool: '' },
      { id: 'art2', text: 'Mix serves the song (not the engineer\'s ego)', detail: 'The best mix is invisible. Does it make the song more powerful?', tool: '' },
      { id: 'art3', text: 'Reference track comparison done', detail: 'How does your mix compare to a professional reference in the same genre?', tool: 'Reference Track' },
      { id: 'art4', text: 'Fresh-ears check (24-hour rest)', detail: 'Take a break, sleep on it. Come back with fresh ears before sending to mastering.', tool: '' },
    ],
  },
];

const STORAGE_KEY = 'esl_mix_checklist';

function loadChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set<string>((raw ? JSON.parse(raw) : []) as string[]);
  } catch { return new Set(); }
}

function saveChecked(checked: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...checked])); } catch {}
}

interface MixChecklistPanelProps {
  onClose: () => void;
}

export const MixChecklistPanel: React.FC<MixChecklistPanelProps> = ({ onClose }) => {
  const [checked, setChecked] = useState<Set<string>>(() => loadChecked());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveChecked(next);
      return next;
    });
  }, []);

  const totalItems = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const checkedCount = checked.size;
  const progress = checkedCount / totalItems;

  const resetAll = useCallback(() => {
    setChecked(new Set());
    saveChecked(new Set());
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Pre-Mastering Checklist</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {checkedCount}/{totalItems} items checked �{(progress * 100).toFixed(0)}% complete
            </p>
          </div>
          <div className="flex items-center gap-2">
            {checkedCount > 0 && (
              <button onClick={resetAll} className="text-[9px] text-slate-600 hover:text-slate-400 border border-white/[0.06] px-2 py-1 rounded-lg transition-all">
                Reset
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/[0.04]">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {progress === 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 text-center space-y-1"
            >
              <p className="text-2xl">🎉</p>
              <p className="text-[12px] font-bold text-emerald-300">Mix is ready for mastering!</p>
              <p className="text-[9px] text-slate-500">All checks passed. Send it to the AI master engine.</p>
            </motion.div>
          )}

          {SECTIONS.map(section => {
            const sectionChecked = section.items.filter(i => checked.has(i.id)).length;
            const sectionComplete = sectionChecked === section.items.length;

            return (
              <div key={section.title} className="space-y-1.5">
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{section.emoji}</span>
                    <p className="text-[10px] font-bold text-slate-300">{section.title}</p>
                    {sectionComplete && <span className="text-[8px] text-emerald-400">�done</span>}
                  </div>
                  <p className="text-[8px] text-slate-600">{sectionChecked}/{section.items.length}</p>
                </div>

                {/* Items */}
                {section.items.map(item => {
                  const isDone = checked.has(item.id);
                  const isExpanded = expandedItem === item.id;

                  return (
                    <div key={item.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
                      <div className="flex items-start gap-3 px-3 py-2.5">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggle(item.id)}
                          className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            isDone
                              ? 'border-transparent'
                              : 'border-white/20 hover:border-white/40'
                          }`}
                          style={isDone ? { background: section.color } : {}}
                        >
                          {isDone && <span className="text-white text-[8px] font-bold">✓</span>}
                        </button>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                            className={`text-left text-[10px] font-semibold leading-snug transition-colors ${
                              isDone ? 'text-slate-500 line-through' : 'text-slate-200 hover:text-white'
                            }`}
                          >
                            {item.text}
                          </button>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <p className="text-[8px] text-slate-500 leading-relaxed mt-1">{item.detail}</p>
                                {item.tool && (
                                  <p className="text-[7px] mt-1" style={{ color: section.color }}>
                                    �Use: {item.tool}
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                          className="text-slate-700 hover:text-slate-500 text-xs ml-1 flex-shrink-0"
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
};
