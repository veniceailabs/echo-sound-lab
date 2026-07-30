/**
 * EqAdvisorPanel â€Automated EQ analysis and suggestions
 *
 * Analyzes the uploaded audio's frequency balance against a reference
 * "ideal" curve and returns specific EQ moves with frequency, gain, Q,
 * and rationale. Not a replacement for ears â€a starting point.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeEq, EqAnalysisResult, EqSuggestion } from '../services/eqAdvisor';

interface EqAdvisorPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  mud:       '#f59e0b',
  boxiness:  '#f97316',
  harshness: '#ef4444',
  air:       '#22d3ee',
  bass:      '#a855f7',
  rumble:    '#6366f1',
  balance:   '#10b981',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning:  '#f59e0b',
  info:     '#22d3ee',
};

function FreqBar({ label, value, target, color }: {
  key?: React.Key;
  label: string; value: number; target: number; color: string;
}) {
  const pct = Math.min(1, value) * 100;
  const targetPct = Math.min(1, target * 4) * 100; // scaled for display

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</span>
        <span className="text-[7px] font-mono text-slate-600">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="relative h-1.5 bg-white/[0.06] rounded-full overflow-visible">
        <motion.div
          className="absolute left-0 top-0 bottom-0 rounded-full"
          style={{ background: color }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
        {/* Target line */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-white/20"
          style={{ left: `${targetPct}%` }}
        />
      </div>
    </div>
  );
}

function SuggestionCard({ s }: { key?: React.Key; s: EqSuggestion }) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CATEGORY_COLORS[s.category] ?? '#22d3ee';
  const sevColor = SEVERITY_COLORS[s.severity] ?? '#22d3ee';

  const freqLabel = s.frequency >= 1000
    ? `${(s.frequency / 1000).toFixed(1)}kHz`
    : `${s.frequency}Hz`;

  return (
    <motion.div layout className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sevColor }} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-200">{s.label}</p>
          <p className="text-[8px] text-slate-600 mt-0.5 capitalize">{s.category} Â{s.type}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] font-mono" style={{ color: catColor }}>{freqLabel}</p>
          <p className={`text-[10px] font-mono font-bold ${s.gainDb > 0 ? 'text-cyan-300' : 'text-red-300'}`}>
            {s.gainDb > 0 ? '+' : ''}{s.gainDb} dB
          </p>
        </div>
        <span className="text-slate-700 text-xs ml-1">{expanded ? 'â–²' : 'â–¼'}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/[0.04]"
          >
            <div className="px-4 pb-4 pt-3 space-y-3">
              <p className="text-[9px] text-slate-400 leading-relaxed">{s.rationale}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                  <p className="text-[7px] text-slate-600 uppercase">Freq</p>
                  <p className="text-[10px] font-mono text-slate-200 font-bold">{freqLabel}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                  <p className="text-[7px] text-slate-600 uppercase">Gain</p>
                  <p className={`text-[10px] font-mono font-bold ${s.gainDb > 0 ? 'text-cyan-300' : 'text-red-300'}`}>
                    {s.gainDb > 0 ? '+' : ''}{s.gainDb} dB
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                  <p className="text-[7px] text-slate-600 uppercase">Q</p>
                  <p className="text-[10px] font-mono text-slate-200 font-bold">{s.q.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const EqAdvisorPanel: React.FC<EqAdvisorPanelProps> = ({ buffer, onClose }) => {
  const [result, setResult] = useState<EqAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!buffer) return;
    setLoading(true);
    setError(null);
    try {
      const r = await analyzeEq(buffer);
      setResult(r);
    } catch (e) {
      setError('Analysis failed. Try a different audio file.');
    } finally {
      setLoading(false);
    }
  }, [buffer]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const balanceColor = result?.overallBalance === 'bright' ? '#22d3ee'
    : result?.overallBalance === 'dark' ? '#a855f7' : '#10b981';

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
            <h2 className="text-sm font-bold text-white">EQ Advisor</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Frequency balance analysis Âspecific EQ move suggestions
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track to analyze</p>
          )}

          {loading && (
            <div className="text-center py-8 space-y-2">
              <motion.div
                className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 mx-auto"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-[10px] text-slate-500">Analyzing frequency balanceâ€¦</p>
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center py-6">{error}</p>}

          {result && !loading && (
            <>
              {/* Score + balance */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest">Frequency balance</p>
                    <p className="text-xl font-black capitalize" style={{ color: balanceColor }}>
                      {result.overallBalance}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest">Balance score</p>
                    <p className="text-3xl font-black text-white">{result.score}</p>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed">{result.summary}</p>

                {/* Band balance bars */}
                <div className="space-y-2 pt-1">
                  {[
                    { label: 'Sub Bass', value: result.bassEnergy * 0.3, target: 0.08, color: '#7c3aed' },
                    { label: 'Bass', value: result.bassEnergy, target: 0.22, color: '#a855f7' },
                    { label: 'Mids', value: result.midEnergy, target: 0.20, color: '#22d3ee' },
                    { label: 'High', value: result.highEnergy, target: 0.14, color: '#f59e0b' },
                  ].map(b => (
                    <FreqBar key={b.label} {...b} />
                  ))}
                </div>
                <p className="text-[7px] text-slate-700">
                  White line = target. Colored bar = actual. Gaps show where to EQ.
                </p>
              </div>

              {/* Suggestions */}
              {result.suggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                    Suggested EQ moves ({result.suggestions.length})
                  </p>
                  {result.suggestions.map((s, i) => (
                    <SuggestionCard key={i} s={s} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-center">
                  <p className="text-emerald-300 text-[11px] font-bold">âœNo significant EQ corrections needed</p>
                  <p className="text-[9px] text-slate-500 mt-1">Frequency balance looks healthy. Minor tweaks only for taste.</p>
                </div>
              )}

              <button
                onClick={runAnalysis}
                className="w-full py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[10px] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all uppercase tracking-widest"
              >
                â†Re-analyze
              </button>

              <p className="text-[8px] text-slate-700 text-center">
                These are starting points â€always trust your ears over algorithms.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
