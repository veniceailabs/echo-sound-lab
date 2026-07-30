import React from 'react';
import { motion } from 'framer-motion';
import { analyzeEliteMixingAdvisor } from '../services/finishing/eliteMixingAdvisor';
import type { AnalysisResult, AudioMetrics, ProcessingConfig, ReferenceTrack } from '../types';
import type { FinishLoopAnalysis } from '../services/finishing/finishLoopEngine';
import type { ReferenceDeltaAnalysis } from '../services/finishing/referenceDeltaEngine';
import type { SessionFinishAuthorityAnalysis } from '../services/finishing/sessionFinishAuthority';
import type { AestheticClassification } from '../services/AestheticClassifierService';
import type { MicroMoveResult } from '../services/MicroMoveEngine';

interface EliteMixingPanelProps {
  analysisResult: AnalysisResult | null;
  originalMetrics?: AudioMetrics | null;
  processedMetrics?: AudioMetrics | null;
  currentConfig?: ProcessingConfig | null;
  referenceTrack?: ReferenceTrack | null;
  referenceDelta?: ReferenceDeltaAnalysis | null;
  finishLoop?: FinishLoopAnalysis | null;
  sessionFinish?: SessionFinishAuthorityAnalysis | null;
  snapshotABActive?: boolean;
  // Phase 2A/2C additions
  aestheticResult?: AestheticClassification | null;
  microMoves?: MicroMoveResult | null;
  onApplyMicroMove?: (config: ProcessingConfig) => void;
}

const readinessTone: Record<'ready' | 'building' | 'needs_work', string> = {
  ready: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  building: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  needs_work: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const EliteMixingPanel: React.FC<EliteMixingPanelProps> = ({
  analysisResult,
  originalMetrics,
  processedMetrics,
  currentConfig,
  referenceTrack,
  referenceDelta,
  finishLoop,
  sessionFinish,
  snapshotABActive = false,
  aestheticResult,
  microMoves,
  onApplyMicroMove,
}) => {
  if (!analysisResult && !referenceDelta && !finishLoop && !sessionFinish && !referenceTrack && !aestheticResult) {
    return null;
  }

  const advisory = analyzeEliteMixingAdvisor({
    analysisResult,
    originalMetrics: originalMetrics ?? null,
    processedMetrics: processedMetrics ?? null,
    currentConfig: currentConfig ?? null,
    referenceTrack: referenceTrack ?? null,
    referenceDelta: referenceDelta ?? null,
    finishLoop: finishLoop ?? null,
    sessionFinish: sessionFinish ?? null,
    snapshotABActive,
  });

  return (
    <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-950/60 p-5 sm:p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Elite behaviors</p>
          <h3 className="mt-2 text-lg font-bold text-white">This mix should win in one listen.</h3>
        </div>
        <p className="text-xs text-slate-400">{advisory.headline}</p>
      </div>

      <p className="mt-3 text-sm text-slate-200">{advisory.pitchLine}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {advisory.layers.map((layer) => (
          <div key={layer.title} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{layer.title}</div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${readinessTone[layer.readiness]}`}>
                {layer.score}
              </span>
            </div>
            <div className="mt-2 text-sm font-semibold text-white">{layer.summary}</div>
            <p className="mt-2 text-xs text-slate-400">{layer.evidence}</p>
            <p className="mt-3 text-xs text-emerald-200/90">{layer.action}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/70 p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Skipped overlaps</div>
        <ul className="mt-2 space-y-2 text-sm text-slate-200">
          {advisory.overlapNotes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Next best move</div>
        <p className="mt-2 text-sm text-slate-200">{advisory.nextBestMove}</p>
      </div>

      {/* Phase 2A: Genre Classification */}
      {aestheticResult && (
        <motion.div
          className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400">Genre Detection</div>
            <span className="text-xs font-bold text-cyan-300">
              {Math.round(aestheticResult.primaryGenre.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm font-semibold text-white mb-1">{aestheticResult.primaryGenre.genreName}</p>
          <div className="flex gap-2 flex-wrap mt-2">
            {aestheticResult.topGenres.slice(0, 3).map((g) => (
              <span key={g.genreId} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">
                {g.genreName} {Math.round(g.confidence * 100)}%
              </span>
            ))}
          </div>
          {aestheticResult.recommendation.eqMoves.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Recommended moves</div>
              {aestheticResult.recommendation.eqMoves.slice(0, 3).map((move, i) => (
                <p key={i} className="text-xs text-slate-300">
                  {move.gain > 0 ? '+' : ''}{move.gain}dB @ {move.frequency}Hz — {move.rationale}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Phase 2C: MicroMove Quick Apply */}
      {microMoves && onApplyMicroMove && (
        <motion.div
          className="mt-4 rounded-xl border border-purple-500/20 bg-purple-950/20 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-purple-400">Quick Apply</div>
            <span className="text-xs text-slate-500">{Math.round(microMoves.confidence * 100)}% confidence</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Apply {microMoves.genre} processing chain</p>
          <div className="grid grid-cols-3 gap-2">
            {(['conservative', 'moderate', 'aggressive'] as const).map((level) => (
              <motion.button
                key={level}
                onClick={() => onApplyMicroMove(microMoves[level])}
                className="py-2 rounded-lg text-xs font-semibold uppercase tracking-widest border transition-all
                  border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/50"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                {level}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default EliteMixingPanel;
