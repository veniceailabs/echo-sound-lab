/**
 * FrequencyReferenceCard �Engineer's EQ cheat sheet
 *
 * A quick-reference panel showing what each frequency region sounds like,
 * what instruments live there, and what common EQ moves achieve.
 * Tap any band for expanded detail + typical boost/cut amounts.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FrequencyReferenceCardProps {
  onClose: () => void;
}

interface FreqBand {
  range: string;
  hz: string;
  color: string;
  feel: string;
  instruments: string;
  boost: string;
  cut: string;
  tips: string[];
}

const BANDS: FreqBand[] = [
  {
    range: 'Sub Bass',
    hz: '20–60 Hz',
    color: '#7c3aed',
    feel: 'Felt, not heard �floor-shaking rumble',
    instruments: 'Sub bass synth, kick sub, bass guitar low fundamental',
    boost: '+3–6 dB adds weight and physical presence',
    cut: 'HPF below 30–40 Hz on everything except kick/bass removes mud',
    tips: [
      'Cut sub from guitars, piano, vocals with HPF at 80–100 Hz',
      'Check on headphones �sub often sounds fine in room but clips on earbuds',
      'Too much sub in the master = pumping on streaming limiters',
    ],
  },
  {
    range: 'Bass',
    hz: '60–250 Hz',
    color: '#6d28d9',
    feel: 'Warmth, body, thickness',
    instruments: 'Bass guitar, kick drum punch, piano low notes, male vocal chest',
    boost: '+3 dB at 80 Hz adds kick punch; +3 dB at 200 Hz adds bass warmth',
    cut: 'Cut 150–200 Hz on guitars to reduce boxiness',
    tips: [
      'Kick and bass often fight in 60–120 Hz �EQ or sidechain one to the other',
      'Cutting 150–250 Hz on midrange instruments reveals clarity',
      'Boost 100–120 Hz on room mic for chest-fill warmth',
    ],
  },
  {
    range: 'Low Mids',
    hz: '250–500 Hz',
    color: '#2563eb',
    feel: 'Muddiness, boxy honk, or warmth',
    instruments: 'Guitar body, piano mid harmonics, brass warmth, vocal chest',
    boost: 'Rarely �easy to make mix sound muddy. +2 dB at 350 Hz adds "wood"',
    cut: 'Cut 300–400 Hz on guitars/piano to remove boxiness and reveal clarity',
    tips: [
      'This is the most cluttered zone in dense mixes �cut instruments that don\'t need warmth',
      '400 Hz cut is one of the most common "clarity" moves in mixing',
      'Upright bass sounds great boosted around 300 Hz',
    ],
  },
  {
    range: 'Mids',
    hz: '500 Hz–2 kHz',
    color: '#0284c7',
    feel: 'Presence, nasal, honky, forward',
    instruments: 'Snare crack, guitar bite, vocal presence, piano attack',
    boost: '+3 dB at 1 kHz adds bite/cut through; rarely needed if other bands are right',
    cut: 'Cut at 800 Hz–1 kHz to remove nasal/honky quality',
    tips: [
      '1 kHz boost makes things stand out in the mix �use sparingly',
      'Nasality on vocals: narrow cut 800 Hz–1.2 kHz',
      'Snare body at 200 Hz, crack at 2.5 kHz',
    ],
  },
  {
    range: 'Upper Mids',
    hz: '2–5 kHz',
    color: '#0891b2',
    feel: 'Harshness, attack, intelligibility',
    instruments: 'Vocal consonants, guitar pick attack, hi-hat, synth lead edge',
    boost: '+2–4 dB at 3 kHz adds vocal presence / guitar aggression',
    cut: 'Cut 3–4 kHz to reduce harshness in dense mixes',
    tips: [
      'The "loudness" range �ears are most sensitive here. Small boosts = big impact',
      '3.5 kHz is where ear fatigue lives in long sessions',
      'De-essing targets 5–8 kHz but origin is upper mids buildup',
    ],
  },
  {
    range: 'Presence',
    hz: '5–8 kHz',
    color: '#0e7490',
    feel: 'Clarity, airiness, de-essing territory',
    instruments: 'Vocal sibilance, cymbal shimmer, guitar harmonic overtones',
    boost: '+2–3 dB at 6 kHz brightens without harshness',
    cut: 'De-essing: narrow cut 5–8 kHz on vocals removes sibilance',
    tips: [
      '5–8 kHz boost makes acoustic guitar sparkle',
      'Sibilance problems: dynamic EQ or de-esser in this range',
      'Overboost makes mix "spitty" and fatiguing',
    ],
  },
  {
    range: 'Air / Brilliance',
    hz: '8–20 kHz',
    color: '#22d3ee',
    feel: 'Air, shimmer, openness, analog tape sparkle',
    instruments: 'Cymbal shimmer, reverb tails, vocal air, acoustic brightness',
    boost: '+3–6 dB shelf above 12 kHz adds "air" to vocals/mix',
    cut: 'Gentle high shelf cut (-3 dB at 16 kHz) warms harsh digital recordings',
    tips: [
      '"Air" EQ boost (12–16 kHz) is the most-used finishing move in mastering',
      'High-frequency content defines perceived quality and cost of a recording',
      'MP3/streaming codecs degrade this range first �use it before encoding',
    ],
  },
];

export const FrequencyReferenceCard: React.FC<FrequencyReferenceCardProps> = ({ onClose }) => {
  const [selected, setSelected] = useState<number | null>(null);

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
        className="w-full max-w-2xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Frequency Reference</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              EQ cheat sheet �tap any band for boost/cut guidance and tips
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {/* Visual frequency bar */}
          <div className="flex rounded-xl overflow-hidden h-3 mb-4">
            {BANDS.map((b, i) => (
              <motion.button
                key={i}
                onClick={() => setSelected(selected === i ? null : i)}
                className="flex-1 transition-all"
                style={{ background: b.color, opacity: selected === null || selected === i ? 1 : 0.3 }}
                whileHover={{ opacity: 0.8 }}
              />
            ))}
          </div>

          {BANDS.map((band, i) => (
            <motion.div key={i} layout>
              <button
                onClick={() => setSelected(selected === i ? null : i)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  selected === i
                    ? 'border-opacity-40 '
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                }`}
                style={selected === i ? { borderColor: band.color + '50', background: band.color + '0c' } : {}}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: band.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[11px] font-bold text-slate-200">{band.range}</p>
                      <p className="text-[9px] font-mono" style={{ color: band.color }}>{band.hz}</p>
                    </div>
                    <p className="text-[9px] text-slate-500 truncate">{band.feel}</p>
                  </div>
                  <span className="text-slate-700 text-xs">{selected === i ? '▲' : '▼'}</span>
                </div>
              </button>

              <AnimatePresence>
                {selected === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="rounded-xl border mt-1 p-4 space-y-3"
                      style={{ borderColor: band.color + '30', background: band.color + '06' }}
                    >
                      <div>
                        <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Instruments in this range</p>
                        <p className="text-[10px] text-slate-400">{band.instruments}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15 p-2.5">
                          <p className="text-[7px] text-emerald-600 uppercase tracking-widest mb-1">↑ Boost</p>
                          <p className="text-[9px] text-emerald-300">{band.boost}</p>
                        </div>
                        <div className="rounded-lg bg-red-500/[0.06] border border-red-500/15 p-2.5">
                          <p className="text-[7px] text-red-600 uppercase tracking-widest mb-1">�Cut</p>
                          <p className="text-[9px] text-red-300">{band.cut}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] text-slate-600 uppercase tracking-widest">Pro tips</p>
                        {band.tips.map((tip, j) => (
                          <p key={j} className="text-[9px] text-slate-500 leading-relaxed">
                            �{tip}
                          </p>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};
