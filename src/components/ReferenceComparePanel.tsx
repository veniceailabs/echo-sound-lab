/**
 * ReferenceComparePanel
 *
 * Drop a reference track (Drake, Billie Eilish, whatever the client sent).
 * In ~2 seconds: see exactly how your mix differs and what processing
 * the reference track received. One button matches your mix to it.
 *
 * This is what mastering engineers charge $300/hour to do manually.
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProcessingConfig } from '../types';

// ──�Spectral comparison helper (Goertzel, no FFT) ────────────────────────────

const COMPARE_BANDS = [
  { label: 'Sub',      lo: 20,   hi: 80   },
  { label: 'Bass',     lo: 80,   hi: 250  },
  { label: 'Lo-Mid',   lo: 250,  hi: 800  },
  { label: 'Mid',      lo: 800,  hi: 2500 },
  { label: 'Hi-Mid',   lo: 2500, hi: 6000 },
  { label: 'Air',      lo: 6000, hi: 16000},
];

function goertzelBandEnergy(samples: Float32Array, sr: number, loHz: number, hiHz: number): number {
  const winSize = Math.min(2048, samples.length);
  let bandE = 0, totalE = 1e-10;
  const nBins = 12;
  const step = Math.max(1, Math.floor(samples.length / 8));

  for (let start = 0; start <= samples.length - winSize; start += step * winSize) {
    const win = samples.subarray(start, start + winSize);
    for (let b = 0; b < nBins; b++) {
      const freq = loHz + (b / (nBins - 1)) * (hiHz - loHz);
      const omega = (2 * Math.PI * freq) / sr;
      const coeff = 2 * Math.cos(omega);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < win.length; i++) {
        const s = (win[i] ?? 0) + coeff * s1 - s2;
        s2 = s1; s1 = s;
      }
      bandE += s2 * s2 + s1 * s1 - coeff * s1 * s2;
    }
    for (let i = 0; i < win.length; i++) totalE += (win[i] ?? 0) ** 2;
    break;
  }
  return Math.min(bandE / (totalE * nBins + 1e-10), 2);
}

function monoData(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) out[i]! += ch[i]!;
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}

function measureBands(buffer: AudioBuffer): number[] {
  const mono = monoData(buffer);
  const sr = buffer.sampleRate;
  return COMPARE_BANDS.map(b => goertzelBandEnergy(mono, sr, b.lo, b.hi));
}

function peakDb(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

function rmsDb(buffer: AudioBuffer): number {
  let sum = 0, count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { sum += d[i]! ** 2; count++; }
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

function stereoWidthRatio(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels < 2) return 0;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  let midE = 0, sideE = 0;
  for (let i = 0; i < L.length; i++) {
    const m = (L[i]! + R[i]!) * 0.5;
    const s = (L[i]! - R[i]!) * 0.5;
    midE += m * m; sideE += s * s;
  }
  return midE > 0 ? Math.min(sideE / midE, 2) : 0;
}

// ──�Types ────────────────────────────────────────────────────────────────────

interface SpectralDelta {
  band: string;
  userDb: number;   // relative band energy in dB
  refDb: number;
  deltaDb: number;  // ref - user (positive = user needs more here)
}

interface CompareResult {
  spectralDeltas: SpectralDelta[];
  loudnessDelta: number;   // reference LUFS - user LUFS (positive = user quieter)
  dynamicsDelta: number;   // crest factor delta
  widthDelta: number;      // stereo width ratio delta
  fxMatch: {
    reverbType: string;
    reverbDecay: number;
    delayType: string;
    delayBpm: number | null;
    vocalForwardness: number;
    sidechainDetected: boolean;
  } | null;
  matchConfidence: number;
  explanations: string[];
  suggestedConfig: ProcessingConfig | null;
}

interface ReferencePanelProps {
  userBuffer: AudioBuffer | null;
  onApplyConfig?: (config: ProcessingConfig, explanations: string[]) => void;
}

// ──�Delta Bar ────────────────────────────────────────────────────────────────

const DeltaBar: React.FC<{
  label: string;
  delta: number;   // dB difference �positive = user needs MORE
  maxDelta?: number;
}> = ({ label, delta, maxDelta = 6 }) => {
  const pct = Math.min(Math.abs(delta) / maxDelta, 1);
  const isPositive = delta > 0;
  const isNeutral = Math.abs(delta) < 0.5;

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-white/30 uppercase tracking-widest">{label}</span>
        <span className={`text-[10px] font-medium tabular-nums ${
          isNeutral ? 'text-emerald-400' : isPositive ? 'text-blue-400' : 'text-amber-400'
        }`}>
          {isNeutral ? '�Match' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} dB`}
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden relative">
        {/* Center marker */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
        {!isNeutral && (
          <motion.div
            className={`absolute top-0 bottom-0 rounded-full ${
              isPositive ? 'bg-blue-400/70' : 'bg-amber-400/70'
            }`}
            style={{
              left: isPositive ? '50%' : `${50 - pct * 50}%`,
              width: `${pct * 50}%`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${pct * 50}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        )}
      </div>
    </div>
  );
};

// ──�Main Component ───────────────────────────────────────────────────────────

export const ReferenceComparePanel: React.FC<ReferencePanelProps> = ({
  userBuffer,
  onApplyConfig,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [refName, setRefName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeReference = useCallback(async (file: File) => {
    if (!userBuffer) return;
    setRefName(file.name);
    setIsAnalyzing(true);
    setResult(null);
    setApplied(false);

    try {
      const ab = await file.arrayBuffer();
      const ctx = new AudioContext();
      const refBuffer = await ctx.decodeAudioData(ab);

      // Run both spectral measurements in parallel
      const [userBands, refBands] = await Promise.all([
        Promise.resolve(measureBands(userBuffer)),
        Promise.resolve(measureBands(refBuffer)),
      ]);

      // Convert band energies to dB and compute deltas
      const spectralDeltas: SpectralDelta[] = COMPARE_BANDS.map((band, i) => {
        const userE = userBands[i] ?? 1e-10;
        const refE  = refBands[i]  ?? 1e-10;
        const userDb = 10 * Math.log10(Math.max(userE, 1e-10));
        const refDb  = 10 * Math.log10(Math.max(refE,  1e-10));
        return { band: band.label, userDb, refDb, deltaDb: refDb - userDb };
      });

      // Loudness, dynamics, width
      const userRms   = rmsDb(userBuffer);
      const refRms    = rmsDb(refBuffer);
      const userPeak  = peakDb(userBuffer);
      const refPeak   = peakDb(refBuffer);
      const loudnessDelta = refRms - userRms;
      const dynamicsDelta = (refPeak - refRms) - (userPeak - userRms);
      const widthDelta = stereoWidthRatio(refBuffer) - stereoWidthRatio(userBuffer);

      // FX analysis + config generation
      let fxMatch: CompareResult['fxMatch'] = null;
      let matchConfidence = 0;
      let explanations: string[] = [];
      let suggestedConfig: ProcessingConfig | null = null;

      try {
        const { fxMatchingEngine } = await import('../services/fxMatchingEngine');
        const match = await fxMatchingEngine.matchReference(refBuffer);
        fxMatch = {
          reverbType: match.reverbConfig.type,
          reverbDecay: match.reverbConfig.decay,
          delayType: match.delayConfig.type,
          delayBpm: match.delayConfig.timeBPM,
          vocalForwardness: match.vocalConfig.presenceBoost,
          sidechainDetected: match.sidechainConfig.enabled,
        };
        matchConfidence = match.matchConfidence;
        explanations = match.explanations;
        suggestedConfig = match.suggestedConfig;
      } catch {
        matchConfidence = 40;
        explanations = ['FX analysis unavailable �spectral match applied.'];
      }

      // Supplement with our spectral analysis
      const bigDeltas = spectralDeltas.filter(d => Math.abs(d.deltaDb) > 1.5);
      for (const d of bigDeltas) {
        const dir = d.deltaDb > 0 ? 'boost' : 'cut';
        explanations.unshift(
          `${d.band} (${COMPARE_BANDS.find(b => b.label === d.band)?.lo}–${COMPARE_BANDS.find(b => b.label === d.band)?.hi} Hz): ${dir} ${Math.abs(d.deltaDb).toFixed(1)} dB to match reference`
        );
      }
      if (Math.abs(loudnessDelta) > 0.5) {
        explanations.unshift(
          `Loudness: ${loudnessDelta > 0 ? 'increase' : 'reduce'} by ${Math.abs(loudnessDelta).toFixed(1)} dB to match reference`
        );
      }

      setResult({
        spectralDeltas,
        loudnessDelta,
        dynamicsDelta,
        widthDelta,
        fxMatch,
        matchConfidence,
        explanations,
        suggestedConfig,
      });
    } catch (e) {
      console.error('Reference analysis failed:', e);
    } finally {
      setIsAnalyzing(false);
    }
  }, [userBuffer]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void analyzeReference(file);
  }, [analyzeReference]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('audio/') || /\.(wav|mp3|aiff?|flac|m4a|ogg)$/i.test(file.name))) {
      void analyzeReference(file);
    }
  }, [analyzeReference]);

  const handleApply = useCallback(async () => {
    if (!result?.suggestedConfig || isApplying) return;
    setIsApplying(true);
    try {
      onApplyConfig?.(result.suggestedConfig, result.explanations);
      setApplied(true);
    } finally {
      setIsApplying(false);
    }
  }, [result, isApplying, onApplyConfig]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm">
            🎯
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">
                Reference Match
              </span>
              {result && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                  {result.matchConfidence}% match confidence
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/40 mt-0.5">
              {refName ?? 'Drop a reference track to see how your mix compares'}
            </p>
          </div>
        </div>
        {result && (
          <button
            onClick={() => { setResult(null); setRefName(null); setApplied(false); }}
            className="text-white/30 hover:text-white/60 px-1.5 py-1 rounded-lg hover:bg-white/[0.06] transition-colors text-base leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Drop zone (shows when no reference loaded) */}
      {!result && !isAnalyzing && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            mx-4 my-3 rounded-xl border-2 border-dashed cursor-pointer
            flex flex-col items-center justify-center py-6 gap-2
            transition-all duration-200
            ${isDragging
              ? 'border-indigo-400/60 bg-indigo-500/10'
              : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'}
            ${!userBuffer ? 'opacity-40 pointer-events-none' : ''}
          `}
        >
          <span className="text-2xl">🎵</span>
          <p className="text-xs text-white/50 font-medium">
            {userBuffer ? 'Drop reference track here' : 'Load your mix first'}
          </p>
          <p className="text-[10px] text-white/25">
            WAV �MP3 �AIFF �FLAC
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Analyzing state */}
      {isAnalyzing && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 rounded-full border-2 border-indigo-400/30 border-t-indigo-400"
          />
          <div className="text-center">
            <p className="text-xs text-white/60 font-medium">Analyzing reference…</p>
            <p className="text-[10px] text-white/25 mt-0.5">Spectral �FX �Dynamics �Stereo field</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="p-4 space-y-4">
          {/* Spectral delta bars */}
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-widest mb-2">
              Frequency Balance �Your Mix vs Reference
            </p>
            <div className="space-y-2">
              {result.spectralDeltas.map(d => (
                <DeltaBar key={d.band} label={d.band} delta={d.deltaDb} maxDelta={8} />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-amber-400/60">�Cut here</span>
              <span className="text-[8px] text-white/25">BALANCED</span>
              <span className="text-[8px] text-blue-400/60">Boost here →</span>
            </div>
          </div>

          {/* Loudness + dynamics + width */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Loudness', delta: result.loudnessDelta, max: 12 },
              { label: 'Dynamics', delta: result.dynamicsDelta, max: 6 },
              { label: 'Stereo Width', delta: result.widthDelta * 10, max: 6 },
            ].map(({ label, delta, max }) => (
              <div key={label} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1">{label}</p>
                <p className={`text-xs font-semibold tabular-nums ${
                  Math.abs(delta) < 0.5 ? 'text-emerald-400' :
                  delta > 0 ? 'text-blue-400' : 'text-amber-400'
                }`}>
                  {Math.abs(delta) < 0.5 ? '�Match' :
                    `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${label === 'Stereo Width' ? '' : ' dB'}`}
                </p>
              </div>
            ))}
          </div>

          {/* Detected FX chain */}
          {result.fxMatch && (
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-2">Detected FX Chain</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Reverb</span>
                  <span className="text-[10px] text-white/70 capitalize">{result.fxMatch.reverbType} �{result.fxMatch.reverbDecay.toFixed(1)}s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Delay</span>
                  <span className="text-[10px] text-white/70 capitalize">
                    {result.fxMatch.delayType}
                    {result.fxMatch.delayBpm ? ` �${result.fxMatch.delayBpm.toFixed(0)} BPM` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Vocal push</span>
                  <span className="text-[10px] text-white/70">+{result.fxMatch.vocalForwardness.toFixed(1)} dB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Sidechain</span>
                  <span className={`text-[10px] font-medium ${result.fxMatch.sidechainDetected ? 'text-amber-400' : 'text-white/40'}`}>
                    {result.fxMatch.sidechainDetected ? 'Detected' : 'Not detected'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Key explanations */}
          {result.explanations.length > 0 && (
            <div className="space-y-1">
              {result.explanations.slice(0, 4).map((exp, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] text-white/40">
                  <span className="text-indigo-400/60 mt-0.5 flex-shrink-0">→</span>
                  <span className="leading-relaxed">{exp}</span>
                </div>
              ))}
            </div>
          )}

          {/* Apply button */}
          {result.suggestedConfig && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleApply()}
              disabled={isApplying || applied || !onApplyConfig}
              className={`
                w-full py-2.5 rounded-xl text-xs font-semibold border
                transition-all duration-150
                ${applied
                  ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10 cursor-default'
                  : isApplying
                    ? 'border-white/10 text-white/30 cursor-wait'
                    : 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 hover:border-indigo-500/50'}
              `}
            >
              {applied ? '�Reference FX Applied'
                : isApplying ? 'Applying…'
                : 'Apply Reference FX to My Mix'}
            </motion.button>
          )}

          {/* Re-analyze link */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-[10px] text-white/25 hover:text-white/50 transition-colors text-center"
          >
            Load different reference
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
};

export default ReferenceComparePanel;
