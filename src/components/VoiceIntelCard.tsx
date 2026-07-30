/**
 * VoiceIntelCard �displays vocal analysis pipeline results
 * in a compact, information-dense card.
 *
 * Shows: voice type, fundamental range, compression rationale,
 * de-essing zone, presence EQ targets, context adjustment.
 *
 * This is the "smart assistant" moment: the user sees that the system
 * analyzed their vocal and pre-configured the DSP chain for it.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VocalAnalysisResult } from '../services/vocal/vocalAnalysisPipeline';

interface VoiceIntelCardProps {
  analysis: VocalAnalysisResult;
  onApply?: () => void;
  onDismiss?: () => void;
  isApplied?: boolean;
}

const VOICE_TYPE_EMOJI: Record<string, string> = {
  soprano: '🎤', alto: '🎙️', tenor: '🎵', baritone: '🎸', bass: '🥁', unknown: '🔊',
};

const VOICE_TYPE_LABEL: Record<string, string> = {
  soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor',
  baritone: 'Baritone', bass: 'Bass', unknown: 'Vocal',
};

const STRATEGY_LABEL: Record<string, string> = {
  single_stage:  'Single-stage',
  two_stage:     '2-stage serial',
  parallel:      'NY parallel',
  hybrid:        'Hybrid',
};

const STRATEGY_COLOR: Record<string, string> = {
  single_stage: 'text-emerald-400',
  two_stage:    'text-blue-400',
  parallel:     'text-purple-400',
  hybrid:       'text-amber-400',
};

const Bar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
    <motion.div
      className={`h-full rounded-full ${color}`}
      initial={{ width: 0 }}
      animate={{ width: `${Math.round(value * 100)}%` }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    />
  </div>
);

export const VoiceIntelCard: React.FC<VoiceIntelCardProps> = ({
  analysis,
  onApply,
  onDismiss,
  isApplied = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const { profile, compression, deEssing, presence, context } = analysis;

  const voiceEmoji = VOICE_TYPE_EMOJI[profile.voiceType] ?? '🎤';
  const voiceLabel = VOICE_TYPE_LABEL[profile.voiceType] ?? 'Vocal';
  const stratLabel = STRATEGY_LABEL[compression.strategy] ?? compression.strategy;
  const stratColor = STRATEGY_COLOR[compression.strategy] ?? 'text-white/70';

  const topPresence = presence.presenceTargets[0];
  const topAir      = presence.airTargets[0];
  const topDeEss    = deEssing.zones[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-sm">
            {voiceEmoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">
                {voiceLabel} Detected
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">
                {Math.round(profile.voiceTypeConfidence * 100)}% conf
              </span>
              {isApplied && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                  �Applied
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/40 mt-0.5">
              F0 {Math.round(profile.fundamentalRange.minHz)}–{Math.round(profile.fundamentalRange.maxHz)} Hz
              �DR {profile.dynamicRangeDb.toFixed(1)} dB
              �{profile.rmsLevelDb.toFixed(1)} dBFS RMS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-white/40 hover:text-white/70 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            {expanded ? 'less' : 'more'}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-white/30 hover:text-white/60 px-1.5 py-1 rounded-lg hover:bg-white/[0.06] transition-colors text-base leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Compact stats row */}
      <div className="grid grid-cols-4 gap-0 divide-x divide-white/[0.06] px-1 py-2">
        <div className="px-3 py-0.5">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Compression</p>
          <p className={`text-xs font-semibold ${stratColor}`}>{stratLabel}</p>
          {compression.primaryStack[0] && (
            <p className="text-[10px] text-white/40 mt-0.5">
              {compression.primaryStack[0].ratio.toFixed(1)}:1 @ {compression.primaryStack[0].thresholdDb.toFixed(0)} dB
            </p>
          )}
        </div>

        <div className="px-3 py-0.5">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">De-ess</p>
          {deEssing.shouldApply && topDeEss ? (
            <>
              <p className="text-xs font-semibold text-amber-300">
                {topDeEss.consonants.join('/')}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {topDeEss.recommendation.frequency} Hz
              </p>
            </>
          ) : (
            <p className="text-xs font-semibold text-emerald-400">Clean</p>
          )}
        </div>

        <div className="px-3 py-0.5">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Presence</p>
          {topPresence ? (
            <>
              <p className="text-xs font-semibold text-white/80">
                +{topPresence.gainDb.toFixed(1)} dB
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {topPresence.targetFrequencyHz} Hz
              </p>
            </>
          ) : (
            <p className="text-xs font-semibold text-white/40">–</p>
          )}
        </div>

        <div className="px-3 py-0.5">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Context</p>
          {context ? (
            <>
              <p className="text-xs font-semibold text-white/80 capitalize">
                {context.densityClass.replace('_', ' ')}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5 capitalize">
                {context.presenceAdjustment.direction}
              </p>
            </>
          ) : (
            <p className="text-xs font-semibold text-white/40">–</p>
          )}
        </div>
      </div>

      {/* Vocal characteristics mini-bars */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-x-4 gap-y-2">
        {[
          { label: 'Warmth',      value: profile.warmth,      color: 'bg-amber-500' },
          { label: 'Breathiness', value: profile.breathiness, color: 'bg-sky-400' },
          { label: 'Tightness',   value: profile.tightness,   color: 'bg-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div className="flex justify-between mb-1">
              <span className="text-[9px] text-white/30 uppercase tracking-widest">{label}</span>
              <span className="text-[9px] text-white/40 tabular-nums">{Math.round(value * 100)}%</span>
            </div>
            <Bar value={value} color={color} />
          </div>
        ))}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/[0.06] px-4 py-3 space-y-2"
          >
            {/* Compression rationale */}
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Chain Rationale</p>
              <p className="text-[11px] text-white/60 leading-relaxed">{compression.rationale}</p>
            </div>

            {/* De-ess placement */}
            {deEssing.shouldApply && (
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">De-ess Placement</p>
                <p className="text-[11px] text-white/60">{compression.ordering.rationale}</p>
              </div>
            )}

            {/* Presence targets */}
            {presence.shouldApply && (presence.presenceTargets.length > 0 || presence.airTargets.length > 0) && (
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">EQ Targets</p>
                <div className="space-y-1">
                  {presence.presenceTargets.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="text-blue-300/80 w-4">P</span>
                      <span className="text-white/50">{t.targetFrequencyHz} Hz</span>
                      <span className={t.gainDb > 0 ? 'text-emerald-300' : 'text-red-300'}>
                        {t.gainDb > 0 ? '+' : ''}{t.gainDb.toFixed(1)} dB
                      </span>
                      <span className="text-white/30 truncate flex-1">{t.rationale}</span>
                    </div>
                  ))}
                  {presence.airTargets.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="text-white/40 w-4">A</span>
                      <span className="text-white/50">{t.targetFrequencyHz} Hz</span>
                      <span className={t.gainDb > 0 ? 'text-emerald-300' : 'text-red-300'}>
                        {t.gainDb > 0 ? '+' : ''}{t.gainDb.toFixed(1)} dB
                      </span>
                      <span className="text-white/30 truncate flex-1">{t.rationale}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Formants */}
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Vocal Tract Formants</p>
              <div className="flex gap-4 text-[11px]">
                {[
                  { label: 'F1', value: profile.formants.f1 },
                  { label: 'F2', value: profile.formants.f2 },
                  { label: 'F3', value: profile.formants.f3 },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="text-white/30">{label}</span>
                    <span className="text-white/60 font-medium tabular-nums">{Math.round(value)} Hz</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action bar */}
      {(onApply || onDismiss) && !isApplied && (
        <div className="px-4 pb-3 pt-1 flex gap-2">
          {onApply && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onApply}
              className="flex-1 text-xs font-semibold rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 py-2 px-3 transition-colors"
            >
              Apply Config
            </motion.button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xs text-white/30 hover:text-white/50 py-2 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default VoiceIntelCard;
