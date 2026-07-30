/**
 * MixCritiquePanel �AI-powered pre-mastering mix analysis
 *
 * Scans the mix before you master and flags issues in plain English:
 * clipping, over-compression, mud, harsh highs, phase problems, etc.
 * Gives an overall readiness score and concrete next steps.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeMix, MixCritiqueResult, MixIssue } from '../services/mixCritique';

interface MixCritiquePanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const SEVERITY_COLOR: Record<MixIssue['severity'], string> = {
  critical: 'text-red-400 border-red-500/30 bg-red-500/10',
  warning:  'text-amber-400 border-amber-500/30 bg-amber-500/10',
  info:     'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
};

const SEVERITY_ICON: Record<MixIssue['severity'], string> = {
  critical: '🔴',
  warning:  '🟡',
  info:     '🔵',
};

const CATEGORY_ICON: Record<MixIssue['category'], string> = {
  loudness:  '📢',
  dynamics:  '📊',
  frequency: '🎚',
  stereo:    '↔️',
  clipping:  '⚡',
  noise:     '🌫',
};

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#22d3ee' : score >= 60 ? '#fbbf24' : '#f87171';

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <motion.circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <motion.span
        className="text-2xl font-bold tabular-nums"
        style={{ color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {score}
      </motion.span>
    </div>
  );
}

function IssueCard({ issue, index, key }: { issue: MixIssue; index: number; key?: React.Key }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-xl border p-3 cursor-pointer transition-all ${SEVERITY_COLOR[issue.severity]}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none mt-0.5">
          {CATEGORY_ICON[issue.category]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold leading-tight">{issue.title}</p>
            {issue.value && (
              <span className="text-[9px] font-mono opacity-70 shrink-0">{issue.value}</span>
            )}
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="text-[10px] opacity-80 mt-1.5 leading-relaxed">{issue.description}</p>
                <div className="mt-2 pt-2 border-t border-current/20">
                  <p className="text-[9px] uppercase tracking-widest opacity-60 mb-0.5">What to do</p>
                  <p className="text-[10px] leading-relaxed">{issue.suggestion}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!expanded && (
            <p className="text-[10px] opacity-60 mt-0.5 truncate">{issue.description.split('.')[0]}.</p>
          )}
        </div>
        <span className="text-[8px] opacity-40 shrink-0 mt-0.5">{expanded ? '▲' : '▼'}</span>
      </div>
    </motion.div>
  );
}

export const MixCritiquePanel: React.FC<MixCritiquePanelProps> = ({ buffer, onClose }) => {
  const [result, setResult] = useState<MixCritiqueResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!buffer) return;
    setRunning(true);
    setError(null);
    try {
      const r = await analyzeMix(buffer);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setRunning(false);
    }
  }, [buffer]);

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
            <h2 className="text-sm font-bold text-white">AI Mix Critique</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Scans your mix for issues before mastering �frequency, dynamics, stereo, clipping
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!result && !running && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/[0.08] flex items-center justify-center text-3xl">
                🔬
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Ready to scan your mix</p>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed max-w-xs mx-auto">
                  I'll analyse frequency balance, dynamics, clipping, stereo width, and
                  phase coherence �and tell you exactly what to fix before mastering.
                </p>
              </div>
              {!buffer && (
                <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Load a track first �I need audio to analyse.
                </p>
              )}
              <button
                onClick={runAnalysis}
                disabled={!buffer}
                className="px-6 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-semibold text-sm hover:bg-cyan-500/30 hover:text-cyan-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Analyse Mix
              </button>
            </div>
          )}

          {running && (
            <div className="text-center py-12 space-y-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                className="w-10 h-10 mx-auto border-2 border-cyan-500/30 border-t-cyan-400 rounded-full"
              />
              <p className="text-[11px] text-slate-400">Scanning frequency bands, dynamics, stereo field…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8 space-y-3">
              <p className="text-red-400 text-sm">Analysis failed: {error}</p>
              <button onClick={runAnalysis} className="px-4 py-2 rounded-lg bg-white/[0.05] text-slate-400 text-xs hover:text-white transition-all">
                Try again
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* Score + grade */}
              <div className="flex items-center gap-5 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                <ScoreRing score={result.overallScore} />
                <div className="flex-1">
                  <p className="text-white font-bold text-sm">{result.grade}</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    {result.readyToMaster
                      ? 'Your mix is ready for mastering. The engine will take it from here.'
                      : 'Address the issues below before mastering for the best results.'}
                  </p>
                  {/* Quick stats */}
                  <div className="flex gap-3 mt-2.5">
                    {[
                      { label: 'Peak', value: `${result.peakDb.toFixed(1)} dB` },
                      { label: 'LUFS', value: `~${result.estimatedLUFS.toFixed(0)}` },
                      { label: 'DR', value: `${result.dynamicRange.toFixed(0)} dB` },
                      { label: 'Width', value: `${(result.stereoWidth * 100).toFixed(0)}%` },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-[8px] text-slate-600 uppercase tracking-widest">{s.label}</p>
                        <p className="text-[11px] font-mono text-slate-300">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Issues */}
              {result.issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                    {result.issues.length} issue{result.issues.length !== 1 ? 's' : ''} found �tap each to expand
                  </p>
                  {result.issues.map((issue, i) => (
                    <IssueCard key={i} issue={issue} index={i} />
                  ))}
                </div>
              )}

              {/* Strengths */}
              {result.strengths.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">What's working well</p>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
                    {result.strengths.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 text-xs mt-0.5">✓</span>
                        <p className="text-[10px] text-emerald-300 leading-relaxed">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Re-analyse button */}
              <button
                onClick={() => { setResult(null); setTimeout(runAnalysis, 100); }}
                className="w-full py-2 rounded-xl border border-white/[0.06] text-[10px] text-slate-600 hover:text-slate-300 transition-all"
              >
                Re-analyse
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
