/**
 * MixIntelligenceReport
 *
 * A comprehensive "production receipt" that synthesizes every analysis
 * the pipeline ran �vocal analysis, genre detection, Grammy mastering
 * result, LUFS measurements �into a readable, shareable breakdown.
 *
 * This is what a senior engineer would hand you after a session:
 * "Here's what we found, here's what we did, here's why."
 *
 * Engineers who see this understand immediately that this isn't a toy.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VocalAnalysisResult } from '../services/vocal/vocalAnalysisPipeline';
import type { GrammyMasterResult } from '../services/grammyMasterService';

// ──�Types ────────────────────────────────────────────────────────────────────

export interface MixIntelligenceData {
  fileName?: string;
  genre?: string | null;
  genreConfidence?: number;
  bpm?: number;
  spectralCentroid?: number;
  vocalAnalysis?: VocalAnalysisResult | null;
  grammyResult?: GrammyMasterResult | null;
  engine?: 'python' | 'browser' | null;
  gradeLabel?: string | null;
  originalLufs?: number | null;
  masteredLufs?: number | null;
  truePeak?: number | null;
  processedAt?: Date;
}

interface MixIntelligenceReportProps {
  data: MixIntelligenceData;
  onClose?: () => void;
  onExport?: () => void;
}

// ──�Helper formatters ────────────────────────────────────────────────────────

const fmtLufs = (v: number | null | undefined) =>
  v != null && Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : '—';

const fmtHz = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k Hz` : `${Math.round(v)} Hz`;

const genreDisplayName: Record<string, string> = {
  hip_hop: 'Hip-Hop', trap: 'Trap', pop: 'Pop', rnb: 'R&B',
  rock: 'Rock', electronic: 'Electronic', jazz: 'Jazz', classical: 'Classical',
};

const compressionStrategyExplain: Record<string, string> = {
  single_stage: 'A single compressor with moderate ratio controls dynamics cleanly without pumping.',
  two_stage: 'A two-stage serial chain: gentle glue compression first, then peak control. The standard for polished pop and hip-hop.',
  parallel: 'New York parallel compression blends an aggressively compressed signal with the dry signal �preserves transient attack while thickening sustain.',
  hybrid: 'A hybrid chain combines serial compression with a parallel saturation layer for analog warmth at high gain reduction levels.',
};

// ──�Section components ───────────────────────────────────────────────────────

const Section: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({
  title, icon, children
}) => (
  <div className="border-b border-white/[0.06] last:border-0 py-4 px-5">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm">{icon}</span>
      <h3 className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">{title}</h3>
    </div>
    {children}
  </div>
);

const KV: React.FC<{ label: string; value: React.ReactNode; highlight?: boolean }> = ({
  label, value, highlight
}) => (
  <div className="flex items-baseline justify-between gap-4 py-0.5">
    <span className="text-[11px] text-white/35 flex-shrink-0">{label}</span>
    <span className={`text-[11px] font-medium tabular-nums text-right ${highlight ? 'text-emerald-400' : 'text-white/70'}`}>
      {value}
    </span>
  </div>
);

const Insight: React.FC<{ text: string; type?: 'info' | 'warn' | 'good' }> = ({
  text, type = 'info'
}) => {
  const colors = {
    info: 'border-blue-500/20 bg-blue-500/[0.06] text-blue-200/70',
    warn: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200/70',
    good: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200/70',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 mt-2 text-[11px] leading-relaxed ${colors[type]}`}>
      {text}
    </div>
  );
};

// ──�Main Component ───────────────────────────────────────────────────────────

export const MixIntelligenceReport: React.FC<MixIntelligenceReportProps> = ({
  data, onClose, onExport,
}) => {
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const {
    fileName, genre, genreConfidence, bpm, spectralCentroid,
    vocalAnalysis, grammyResult, engine, gradeLabel,
    originalLufs, masteredLufs, truePeak, processedAt,
  } = data;

  const vocal = vocalAnalysis;
  const profile = vocal?.profile;
  const compression = vocal?.compression;
  const presence = vocal?.presence;
  const deEssing = vocal?.deEssing;

  // Loudness improvement
  const lufsImprovement = (originalLufs != null && masteredLufs != null)
    ? masteredLufs - originalLufs
    : null;

  // Generate platform readiness text
  const platformReadiness = masteredLufs != null ? [
    { name: 'Spotify',     target: -14 },
    { name: 'Apple Music', target: -16 },
    { name: 'YouTube',     target: -14 },
    { name: 'SoundCloud',  target: -8 },
  ].map(p => ({
    ...p,
    delta: masteredLufs - p.target,
    compliant: Math.abs(masteredLufs - p.target) <= 1,
  })) : [];

  const copyText = () => {
    const lines: string[] = [
      `ECHO SOUND LAB �MIX INTELLIGENCE REPORT`,
      `Generated: ${(processedAt ?? new Date()).toLocaleString()}`,
      `File: ${fileName ?? 'Unknown'}`,
      ``,
      `─�DETECTION ──────────────────────────────`,
      `Genre: ${genre ? (genreDisplayName[genre] ?? genre) : '—'}${genreConfidence ? ` (${Math.round(genreConfidence * 100)}% confidence)` : ''}`,
      `BPM: ${bpm?.toFixed(0) ?? '—'}`,
      `Spectral Centroid: ${spectralCentroid ? fmtHz(spectralCentroid) : '—'}`,
      ``,
    ];

    if (profile) {
      lines.push(
        `─�VOCAL PROFILE ──────────────────────────`,
        `Voice Type: ${profile.voiceType} (${Math.round(profile.voiceTypeConfidence * 100)}% conf)`,
        `Fundamental Range: ${Math.round(profile.fundamentalRange.minHz)}–${Math.round(profile.fundamentalRange.maxHz)} Hz`,
        `Dynamic Range: ${profile.dynamicRangeDb.toFixed(1)} dB`,
        `Warmth: ${Math.round(profile.warmth * 100)}%`,
        `Breathiness: ${Math.round(profile.breathiness * 100)}%`,
        ``,
      );
    }

    if (compression) {
      lines.push(
        `─�COMPRESSION CHAIN ──────────────────────`,
        `Strategy: ${compression.strategy}`,
        `Rationale: ${compression.rationale}`,
        ``,
      );
    }

    lines.push(
      `─�MASTERING RESULT ───────────────────────`,
      `Grade: ${gradeLabel ?? '—'}`,
      `Engine: ${engine === 'python' ? 'Python AI (server)' : 'Browser DSP'}`,
      `Original LUFS: ${fmtLufs(originalLufs)}`,
      `Mastered LUFS: ${fmtLufs(masteredLufs)}`,
      `True Peak: ${truePeak?.toFixed(1) ?? '—'} dBTP`,
    );

    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      ref={reportRef}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.03]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-sm">
            📋
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">
                Mix Intelligence Report
              </span>
              {engine && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  engine === 'python'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/10 text-white/50'
                }`}>
                  {engine === 'python' ? '�Python AI' : '�Browser DSP'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/30 mt-0.5">
              {fileName ?? 'Unknown file'} �{(processedAt ?? new Date()).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyText}
            className="text-[10px] text-white/40 hover:text-white/70 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            {copied ? '�Copied' : 'Copy'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/60 px-1.5 py-1 rounded-lg hover:bg-white/[0.06] transition-colors text-base leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ─�Detection ─�*/}
      <Section title="Source Detection" icon="🔍">
        <div className="space-y-0.5">
          <KV
            label="Genre"
            value={
              genre
                ? `${genreDisplayName[genre] ?? genre}${genreConfidence ? ` �${Math.round(genreConfidence * 100)}% confident` : ''}`
                : '—'
            }
          />
          <KV label="Tempo" value={bpm ? `${bpm.toFixed(0)} BPM` : '—'} />
          <KV label="Spectral Centroid" value={spectralCentroid ? fmtHz(spectralCentroid) : '—'} />
        </div>
        {genre && (
          <Insight
            type="info"
            text={`Genre-specific processing was applied: compression curves, EQ targets, and saturation
              character were all tuned to ${genreDisplayName[genre] ?? genre} conventions.`}
          />
        )}
      </Section>

      {/* ─�Vocal Profile ─�*/}
      {profile && (
        <Section title="Vocal Profile" icon="🎤">
          <div className="space-y-0.5">
            <KV
              label="Voice Type"
              value={`${profile.voiceType.charAt(0).toUpperCase() + profile.voiceType.slice(1)} �${Math.round(profile.voiceTypeConfidence * 100)}% confidence`}
            />
            <KV
              label="Fundamental Range"
              value={`${Math.round(profile.fundamentalRange.minHz)}–${Math.round(profile.fundamentalRange.maxHz)} Hz`}
            />
            <KV label="Dynamic Range" value={`${profile.dynamicRangeDb.toFixed(1)} dB`} />
            <KV label="RMS Level" value={`${profile.rmsLevelDb.toFixed(1)} dBFS`} />
            <KV label="Warmth" value={`${Math.round(profile.warmth * 100)}%`} />
            <KV label="Breathiness" value={`${Math.round(profile.breathiness * 100)}%`} />
            <KV label="Tightness" value={`${Math.round(profile.tightness * 100)}%`} />
          </div>
          {profile.formants && (
            <div className="mt-2 flex gap-4">
              {(['f1', 'f2', 'f3'] as const).map(f => (
                <div key={f} className="text-[10px]">
                  <span className="text-white/25">{f.toUpperCase()} </span>
                  <span className="text-white/60 tabular-nums">{Math.round(profile.formants[f])} Hz</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ─�Compression Chain ─�*/}
      {compression && (
        <Section title="Compression Strategy" icon="🗜">
          <div className="space-y-0.5 mb-2">
            <KV
              label="Strategy"
              value={compression.strategy.replace('_', ' ')}
            />
            {compression.primaryStack[0] && (
              <>
                <KV
                  label="Ratio"
                  value={`${compression.primaryStack[0].ratio.toFixed(1)}:1`}
                />
                <KV
                  label="Threshold"
                  value={`${compression.primaryStack[0].thresholdDb.toFixed(0)} dB`}
                />
              </>
            )}
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            {compressionStrategyExplain[compression.strategy] ?? compression.rationale}
          </p>
          <Insight type="info" text={compression.rationale} />
        </Section>
      )}

      {/* ─�De-essing ─�*/}
      {deEssing && deEssing.shouldApply && deEssing.zones.length > 0 && (
        <Section title="De-essing" icon="🎚">
          {deEssing.zones.slice(0, 2).map((zone, i) => (
            <div key={i} className="mb-1.5">
              <KV
                label={zone.consonants.join('/')}
                value={`${zone.recommendation.frequency} Hz �${zone.recommendation.mode}`}
              />
            </div>
          ))}
          <Insight
            type="good"
            text={`Sibilance zones detected and targeted. De-esser placed ${compression?.ordering?.deEsserPosition ?? 'post-compression'} in the signal chain for optimal control.`}
          />
        </Section>
      )}

      {/* ─�Presence & Air EQ ─�*/}
      {presence && presence.shouldApply && (
        <Section title="Presence & Air EQ" icon="✨">
          <div className="space-y-0.5">
            {presence.presenceTargets.slice(0, 3).map((t, i) => (
              <KV
                key={i}
                label={`${fmtHz(t.targetFrequencyHz)}`}
                value={`${t.gainDb > 0 ? '+' : ''}${t.gainDb.toFixed(1)} dB �${t.rationale}`}
              />
            ))}
            {presence.airTargets.slice(0, 2).map((t, i) => (
              <KV
                key={`air-${i}`}
                label={`${fmtHz(t.targetFrequencyHz)} (air)`}
                value={`${t.gainDb > 0 ? '+' : ''}${t.gainDb.toFixed(1)} dB �${t.rationale}`}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ─�Mastering Result ─�*/}
      <Section title="Mastering Result" icon="🏆">
        <div className="space-y-0.5 mb-2">
          {gradeLabel && (
            <KV label="Grade" value={gradeLabel} highlight />
          )}
          <KV label="Engine" value={engine === 'python' ? 'Python AI (server-side)' : 'Browser DSP'} />
          <KV label="Original Loudness" value={fmtLufs(originalLufs)} />
          <KV label="Mastered Loudness" value={fmtLufs(masteredLufs)} highlight />
          {truePeak != null && (
            <KV label="True Peak" value={`${truePeak.toFixed(1)} dBTP`} />
          )}
          {lufsImprovement != null && (
            <KV
              label="Loudness Change"
              value={`${lufsImprovement > 0 ? '+' : ''}${lufsImprovement.toFixed(1)} LU`}
            />
          )}
        </div>

        {/* Grammy metrics */}
        {grammyResult && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
            {Object.entries(grammyResult.metrics ?? {}).slice(0, 6).map(([k, v]) => (
              <KV
                key={k}
                label={k.replace(/([A-Z])/g, ' $1').trim()}
                value={typeof v === 'number' ? v.toFixed(typeof v === 'number' && Math.abs(v) < 10 ? 2 : 1) : String(v)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ─�Platform Readiness ─�*/}
      {platformReadiness.length > 0 && (
        <Section title="Platform Readiness" icon="📡">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {platformReadiness.map(p => (
              <div key={p.name} className="flex items-center justify-between py-0.5">
                <span className="text-[11px] text-white/35">{p.name}</span>
                <span className={`text-[11px] font-medium tabular-nums ${
                  p.compliant ? 'text-emerald-400' : Math.abs(p.delta) < 3 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {p.compliant
                    ? `�${p.target} LUFS`
                    : `${p.delta > 0 ? '+' : ''}${p.delta.toFixed(1)} LU (${p.target})`}
                </span>
              </div>
            ))}
          </div>
          <Insight
            type={platformReadiness.every(p => p.compliant) ? 'good' : 'info'}
            text={
              platformReadiness.every(p => p.compliant)
                ? 'All major platforms will play this at the intended loudness without normalization.'
                : 'Use Platform Export Suite below to generate per-platform normalized files.'
            }
          />
        </Section>
      )}

      {/* Footer */}
      <div className="px-5 py-3 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-[9px] text-white/20">Echo Sound Lab �AI-Powered Mastering</span>
        {onExport && (
          <button
            onClick={onExport}
            className="text-[10px] text-violet-400 hover:text-violet-300 font-medium transition-colors"
          >
            Export all platforms →
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default MixIntelligenceReport;
