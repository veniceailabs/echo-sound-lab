/**
 * Grammy Master Panel
 *
 * One-click, demo-ready mastering with before/after metrics,
 * engineer comparison, and streaming platform targeting.
 * Connects to Python 14-stage DSP backend; falls back to browser processing.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  grammyMasterService,
  GrammyMasterOptions,
  GrammyMasterResult,
  GrammyMetrics,
  Genre,
  type BackendEngineMeta,
  type BackendTrackProfile,
} from '../services/grammyMasterService';

// ─Types ──────────────────────────────────────────────────────────────────

interface GrammyMasterPanelProps {
  audioBuffer: AudioBuffer | null;
  originalMetrics?: { integratedLufs?: number } | null;
  onMasterComplete?: (masteredBuffer: ArrayBuffer, result: GrammyMasterResult) => void;
  isProcessing?: boolean;
  /** Auto-detected genre pre-selects genre dropdown */
  detectedGenre?: string | null;
}

type Phase = 'idle' | 'analyzing' | 'mastering' | 'done' | 'error';

// ─Constants ──────────────────────────────────────────────────────────────

const GENRE_OPTIONS: { value: Genre; label: string }[] = [
  { value: 'hip_hop',    label: 'Hip-Hop' },
  { value: 'trap',       label: 'Trap' },
  { value: 'pop',        label: 'Pop' },
  { value: 'rnb',        label: 'R&B' },
  { value: 'rock',       label: 'Rock' },
  { value: 'electronic', label: 'Electronic' },
  { value: 'jazz',       label: 'Jazz' },
  { value: 'classical',  label: 'Classical' },
];

const PLATFORM_TARGETS: Record<string, number> = {
  'Spotify':      -14,
  'Apple Music':  -16,
  'YouTube':      -14,
  'Tidal':        -14,
  'SoundCloud':   -14,
  'iTunes Store': -16,
};

// ─Subcomponents ──────────────────────────────────────────────────────────

const Meter: React.FC<{ label: string; value: number; unit: string; target?: number; good?: boolean }> = ({
  label, value, unit, target, good,
}) => {
  const color = good === undefined ? 'text-white/70' : good ? 'text-emerald-400' : 'text-amber-400';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-white/40 uppercase tracking-widest">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${color}`}>
        {value.toFixed(1)}<span className="text-xs font-normal ml-0.5 text-white/40">{unit}</span>
      </span>
      {target !== undefined && (
        <span className="text-[10px] text-white/30">target {target.toFixed(1)}{unit}</span>
      )}
    </div>
  );
};

const EngineerCard: React.FC<{ name: string; knownFor: string; matchPct: number; rank: number }> = ({
  name, knownFor, matchPct, rank,
}) => {
  const tier = matchPct >= 85 ? 'gold' : matchPct >= 70 ? 'silver' : 'bronze';
  const tierStyle = {
    gold:   'border-yellow-500/40 bg-yellow-500/5',
    silver: 'border-white/20 bg-white/5',
    bronze: 'border-white/10 bg-white/[0.03]',
  }[tier];
  const barColor = {
    gold:   'bg-gradient-to-r from-yellow-600 to-yellow-400',
    silver: 'bg-gradient-to-r from-white/40 to-white/70',
    bronze: 'bg-gradient-to-r from-white/20 to-white/40',
  }[tier];

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={`rounded-lg border px-3 py-2 ${tierStyle}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-xs font-semibold text-white/90">{name}</p>
          <p className="text-[10px] text-white/40 truncate max-w-[160px]">{knownFor}</p>
        </div>
        <span className="text-sm font-bold text-white/80 tabular-nums">{matchPct}%</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${matchPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: rank * 0.05 + 0.2 }}
        />
      </div>
    </motion.div>
  );
};

// ─Main Component ─────────────────────────────────────────────────────────

export const GrammyMasterPanel: React.FC<GrammyMasterPanelProps> = ({
  audioBuffer,
  originalMetrics,
  onMasterComplete,
  isProcessing = false,
  detectedGenre,
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [genre, setGenre] = useState<Genre>('hip_hop');
  const [platform, setPlatform] = useState<string>('Spotify');
  const [analogMode, setAnalogMode] = useState<'tape' | 'tube' | 'transformer' | 'none'>('tape');
  const [result, setResult] = useState<GrammyMasterResult | null>(null);
  const [previewMetrics, setPreviewMetrics] = useState<GrammyMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);  // null = checking
  const [lastEngine, setLastEngine] = useState<'flagship' | 'python' | 'browser' | null>(null);
  const [vocalMode, setVocalMode] = useState(false);
  const [masterIntensity, setMasterIntensity] = useState(1);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceBuffer, setReferenceBuffer] = useState<AudioBuffer | null>(null);
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [backendProfile, setBackendProfile] = useState<BackendTrackProfile | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const intensityTouchedRef = useRef(false);
  const backendMeta = result ? ((result as any).__backendMeta as BackendEngineMeta | undefined) : undefined;

  const targetLufs = PLATFORM_TARGETS[platform] ?? -14;

  // Sync detected genre into selector
  useEffect(() => {
    if (detectedGenre && GENRE_OPTIONS.some(g => g.value === detectedGenre)) {
      setGenre(detectedGenre as Genre);
    }
  }, [detectedGenre]);

  // Probe backend health on mount
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/proxy/dsp/health', {
          signal: AbortSignal.timeout(4000),
          headers: { 'X-ESL-Request': '1' },
        });
        if (cancelled) return;
        const data: { status?: string } = res.ok ? await res.json().catch(() => ({})) : {};
        setBackendReady(res.ok && ['ready', 'ok', 'healthy'].includes(data.status ?? ''));
      } catch {
        if (!cancelled) setBackendReady(false);
      }
    };
    checkHealth();
    return () => { cancelled = true; };
  }, []);

  // Analyze on first render when buffer changes
  const handleAnalyze = useCallback(async () => {
    if (!audioBuffer) return;
    setPhase('analyzing');
    setProgress(15);
    try {
      const metrics = grammyMasterService.analyzeBuffer(audioBuffer);
      setPreviewMetrics(metrics);
      setProgress(100);
      setPhase('idle');
    } catch (e) {
      setPhase('error');
      setError('Analysis failed');
    }
  }, [audioBuffer]);

  // Trigger analysis when buffer arrives
  React.useEffect(() => {
    if (audioBuffer && !previewMetrics && phase === 'idle') {
      handleAnalyze();
    }
  }, [audioBuffer, previewMetrics, phase, handleAnalyze]);

  useEffect(() => {
    let cancelled = false;
    const loadBackendProfile = async () => {
      if (!audioBuffer) {
        setBackendProfile(null);
        setProfileStatus('idle');
        return;
      }

      setProfileStatus('loading');
      const profile = await grammyMasterService.analyzeTrackProfile(audioBuffer);
      if (cancelled) return;

      if (profile) {
        setBackendProfile(profile);
        setProfileStatus('ready');
      } else {
        setBackendProfile(null);
        setProfileStatus('error');
      }
    };

    void loadBackendProfile();
    return () => {
      cancelled = true;
    };
  }, [audioBuffer]);

  useEffect(() => {
    intensityTouchedRef.current = false;
    setMasterIntensity(1.0);
  }, [audioBuffer]);

  useEffect(() => {
    const suggested = backendProfile?.engine_summary?.target_master_intensity;
    if (typeof suggested !== 'number' || intensityTouchedRef.current) return;
    setMasterIntensity(prev => Math.abs(prev - suggested) > 0.01 ? suggested : prev);
  }, [backendProfile]);

  const handleReferenceUpload = useCallback(async (file: File) => {
    setReferenceError(null);
    setReferenceName(file.name);
    try {
      const bytes = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(bytes);
      setReferenceBuffer(decoded);
    } catch (err) {
      setReferenceBuffer(null);
      setReferenceError(err instanceof Error ? err.message : 'Failed to decode reference');
    }
  }, []);

  const handleMaster = useCallback(async () => {
    if (!audioBuffer || isProcessing) return;
    setPhase('mastering');
    setProgress(0);
    setError(null);

    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 3, 85));
    }, 200);

    try {
      const options: GrammyMasterOptions = {
        genre,
        targetLufs,
        targetCeiling: -0.3,
        analogMode,
        vocalChain: vocalMode,
        masterIntensity,
        referenceBuffer,
      };
      const masterResult = await grammyMasterService.masterTrack(audioBuffer, options);
      clearInterval(progressInterval);
      setProgress(100);
      setResult(masterResult);
      setPhase('done');
      // Tag which engine handled this request
      setLastEngine((masterResult as any).__engine ?? (backendReady ? 'python' : 'browser'));
      onMasterComplete?.(masterResult.masteredBuffer, masterResult);
    } catch (e) {
      clearInterval(progressInterval);
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Mastering failed');
    }
  }, [audioBuffer, genre, targetLufs, analogMode, vocalMode, masterIntensity, referenceBuffer, isProcessing, backendReady, onMasterComplete]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.masteredBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grammy_master_${genre}_${platform.toLowerCase().replace(' ', '_')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, genre, platform]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setProgress(0);
    if (audioBuffer) handleAnalyze();
  }, [audioBuffer, handleAnalyze]);

  const gradeColor = useMemo(() => {
    const g = result?.grade ?? 0;
    if (g >= 95) return 'text-yellow-400';
    if (g >= 85) return 'text-emerald-400';
    if (g >= 70) return 'text-blue-400';
    return 'text-amber-400';
  }, [result?.grade]);

  const lufsGood = previewMetrics
    ? Math.abs(previewMetrics.integratedLufs - targetLufs) <= 2
    : null;

  if (!audioBuffer) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-base">
            🏆
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white tracking-tight">Grammy Master</h2>
              {/* Backend status pill */}
              {backendReady === null ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/30">checking…</span>
              ) : lastEngine === 'flagship' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/20">Flagship AI</span>
              ) : backendReady ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">Python AI</span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">Browser DSP</span>
              )}
              {/* Auto-detected genre badge */}
              {detectedGenre && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/20 capitalize">
                  {detectedGenre.replace('_', ' ')} detected
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">
              Context-aware DSP, reference matching, and proof-layer A/B
              {lastEngine && <span className="ml-2 text-white/25">via {lastEngine}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.22em]">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">
                Free to use
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/50">
                No account required
              </span>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300">
                Flagship path auto-selects when live
              </span>
            </div>
          </div>
        </div>
        {result && (
          <div className={`text-right ${gradeColor}`}>
            <div className="text-2xl font-black tabular-nums">{result.grade}</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest">/ 100</div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Before metrics */}
        {previewMetrics && phase !== 'mastering' && (
          <div className="grid grid-cols-4 gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <Meter
              label="LUFS"
              value={previewMetrics.integratedLufs}
              unit=" LUFS"
              target={targetLufs}
              good={lufsGood ?? undefined}
            />
            <Meter label="True Peak" value={previewMetrics.truePeakDbfs} unit=" dBFS" good={previewMetrics.truePeakDbfs <= -0.3} />
            <Meter label="Crest" value={previewMetrics.crestDb} unit=" dB" good={previewMetrics.crestDb >= 6 && previewMetrics.crestDb <= 16} />
            <Meter label="LRA" value={previewMetrics.lra} unit=" LU" />
          </div>
        )}

        {/* Config row */}
        {phase !== 'done' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={genre}
                onChange={e => setGenre(e.target.value as Genre)}
                className="flex-1 min-w-[100px] text-xs rounded-lg bg-white/[0.08] border border-white/10 text-white px-3 py-2 outline-none focus:border-white/30"
              >
                {GENRE_OPTIONS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}{g.value === detectedGenre ? ' ✓' : ''}</option>
                ))}
              </select>

              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="flex-1 min-w-[110px] text-xs rounded-lg bg-white/[0.08] border border-white/10 text-white px-3 py-2 outline-none focus:border-white/30"
              >
                {Object.entries(PLATFORM_TARGETS).map(([name, lufs]) => (
                  <option key={name} value={name}>{name} ({lufs} LUFS)</option>
                ))}
              </select>

              <select
                value={analogMode}
                onChange={e => setAnalogMode(e.target.value as typeof analogMode)}
                className="flex-1 min-w-[90px] text-xs rounded-lg bg-white/[0.08] border border-white/10 text-white px-3 py-2 outline-none focus:border-white/30"
              >
                <option value="tape">Tape Sat</option>
                <option value="tube">Tube Sat</option>
                <option value="transformer">Transformer</option>
                <option value="none">No Analog</option>
              </select>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/35">Engine Intensity</p>
                  <p className="text-xs text-white/50">Controls how hard the flagship chain leans into shaping.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-cyan-300">{masterIntensity.toFixed(2)}x</p>
                  <p className="text-[10px] text-white/30">smart gain factor</p>
                </div>
              </div>
              <input
                type="range"
                min="0.70"
                max="1.35"
                step="0.01"
                value={masterIntensity}
                onChange={(e) => {
                  intensityTouchedRef.current = true;
                  setMasterIntensity(parseFloat(e.target.value));
                }}
                className="w-full accent-cyan-400"
              />
              <div className="flex items-center justify-between text-[10px] text-white/30 uppercase tracking-wider">
                <span>clean</span>
                <span>balanced</span>
                <span>aggressive</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs text-white/70 hover:bg-white/[0.08] transition-colors"
              >
                <span className="block text-[10px] uppercase tracking-widest text-white/35">Reference Track</span>
                <span>{referenceName ? referenceName : 'Load a reference to match tone and density'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReferenceBuffer(null);
                  setReferenceName(null);
                  setReferenceError(null);
                  if (referenceInputRef.current) referenceInputRef.current.value = '';
                }}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
              >
                Clear
              </button>
              <input
                ref={referenceInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleReferenceUpload(file);
                }}
              />
            </div>
            {referenceBuffer && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                Reference loaded. The flagship master will match against it.
              </div>
            )}
            {referenceError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {referenceError}
              </div>
            )}

            {backendProfile && (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-cyan-300">Live Mix Profile</p>
                    <p className="text-xs text-white/40">Backend analysis returned a steering profile for this master.</p>
                  </div>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] uppercase tracking-widest text-cyan-300">
                    {profileStatus}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Mud</p>
                    <p className="font-semibold text-white">{backendProfile.profile.mud_score.toFixed(3)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Harshness</p>
                    <p className="font-semibold text-white">{backendProfile.profile.harshness_score.toFixed(3)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Mono Safe</p>
                    <p className="font-semibold text-white">{(backendProfile.profile.mono_compatibility * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Air</p>
                    <p className="font-semibold text-white">{backendProfile.profile.air_ratio.toFixed(3)}</p>
                  </div>
                </div>
                {backendProfile.engine_summary && (
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/10 px-3 py-2">
                      <p className="text-cyan-200/60 uppercase tracking-wider">Auto Intensity</p>
                      <p className="font-semibold text-cyan-200">
                        {backendProfile.engine_summary.target_master_intensity?.toFixed(2) ?? masterIntensity.toFixed(2)}x
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-white/35 uppercase tracking-wider">Reference Match</p>
                      <p className="font-semibold text-white">
                        {backendProfile.engine_summary.reference_match !== undefined
                          ? `${(backendProfile.engine_summary.reference_match * 100).toFixed(0)}%`
                          : 'n/a'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-white/35 uppercase tracking-wider">Primary Focus</p>
                      <p className="font-semibold text-white capitalize">
                        {backendProfile.engine_summary.primary_focus?.replace(/_/g, ' ') ?? 'mid'}
                      </p>
                    </div>
                  </div>
                )}
                {backendProfile.reference_delta?.tonal_bias && backendProfile.reference_delta.tonal_bias.length > 0 && (
                  <div className="space-y-1">
                    {backendProfile.reference_delta.tonal_bias.slice(0, 3).map((item) => (
                      <div key={item} className="rounded-lg border border-cyan-400/10 bg-cyan-400/5 px-3 py-2 text-[11px] text-cyan-100/80">
                        {item}
                      </div>
                    ))}
                  </div>
                )}
                {backendProfile.reference_delta?.band_delta_db && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(backendProfile.reference_delta.band_delta_db).map(([band, delta]) => (
                      <span
                        key={band}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wider text-white/45"
                      >
                        {band} {Number(delta) > 0 ? '+' : ''}{Number(delta).toFixed(1)} dB
                      </span>
                    ))}
                  </div>
                )}
                {backendProfile.recommendations.length > 0 && (
                  <div className="space-y-1">
                    {backendProfile.recommendations.slice(0, 3).map((item) => (
                      <div key={item} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
                        {item}
                      </div>
                    ))}
                  </div>
                )}
                {backendProfile.suggested_chain && (
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(backendProfile.suggested_chain).slice(0, 5).map((key) => (
                      <span key={key} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-wider text-white/45">
                        {key}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vocal chain toggle */}
            <button
              onClick={() => setVocalMode(v => !v)}
              className={`w-full flex items-center justify-between text-xs rounded-lg px-3 py-2 transition-colors border ${
                vocalMode
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                  : 'bg-white/[0.05] border-white/[0.08] text-white/50 hover:text-white/70 hover:bg-white/[0.07]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>🎙️</span>
                <span>Vocal Chain Mode</span>
                {vocalMode && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">ON</span>}
              </span>
              <span className="text-[10px] text-white/30">
                {vocalMode ? 'Focused vocal mastering' : 'Full mix mastering'}
              </span>
            </button>
          </div>
        )}

        {/* Progress */}
        <AnimatePresence>
          {phase === 'mastering' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex justify-between text-xs text-white/60">
                <span>Processing through 14-stage chain...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-300"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="text-[10px] text-white/30 text-center">
                Stem separation - oversampled limiting - EQ loop - EBU R128
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {phase === 'error' && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-400">
            {error ?? 'An error occurred'}
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {phase === 'done' && result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {/* Grade banner */}
              <div className={`rounded-xl border px-4 py-3 text-center ${
                result.grade >= 95
                  ? 'border-yellow-500/30 bg-yellow-500/10'
                  : result.grade >= 85
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-blue-500/30 bg-blue-500/10'
              }`}>
                <div className={`text-3xl font-black ${gradeColor}`}>{result.gradeLabel}</div>
                <div className="text-xs text-white/50 mt-1">
                  {result.metrics.integratedLufs.toFixed(1)} LUFS / {result.metrics.truePeakDbfs.toFixed(1)} dBTP / {result.metrics.crestDb.toFixed(1)} dB crest
                </div>
              </div>

              {backendMeta && (
                <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Convergence</p>
                    <p className="font-semibold text-white">
                      {backendMeta.convergencePass ? `${backendMeta.convergencePass + 1} passes` : '1 pass'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Ref Match</p>
                    <p className="font-semibold text-white">
                      {backendMeta.referenceMatch !== undefined ? `${(backendMeta.referenceMatch * 100).toFixed(0)}%` : 'n/a'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Gap</p>
                    <p className="font-semibold text-white">
                      {backendMeta.referenceGap !== undefined ? backendMeta.referenceGap.toFixed(2) : 'n/a'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-white/35 uppercase tracking-wider">Focus</p>
                    <p className="font-semibold text-white capitalize">
                      {backendMeta.primaryFocus?.replace(/_/g, ' ') ?? 'mid'}
                    </p>
                  </div>
                </div>
              )}

              {/* After metrics */}
              <div className="grid grid-cols-4 gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <Meter label="LUFS" value={result.metrics.integratedLufs} unit=" LUFS" target={targetLufs} good={Math.abs(result.metrics.integratedLufs - targetLufs) <= 1} />
                <Meter label="True Peak" value={result.metrics.truePeakDbfs} unit=" dBFS" good={result.metrics.truePeakDbfs <= -0.3} />
                <Meter label="Crest" value={result.metrics.crestDb} unit=" dB" good={result.metrics.crestDb >= 6} />
                <Meter label="LRA" value={result.metrics.lra} unit=" LU" />
              </div>

              {/* Engineer comparisons */}
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Mastering Engineer Match</p>
                <div className="space-y-1.5">
                  {result.engineerComparisons.map((eng, i) => (
                    <EngineerCard key={eng.name} {...eng} rank={i} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-2">
          {phase !== 'done' ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleMaster}
              disabled={phase === 'mastering' || phase === 'analyzing' || isProcessing}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black text-sm font-bold py-3 px-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(234,179,8,0.3)]"
            >
              {phase === 'mastering' ? (
                <span>Mastering...</span>
              ) : (
                <>
                  <span>🏆</span>
                  <span>Grammy Master</span>
                </>
              )}
            </motion.button>
          ) : (
            <>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black text-sm font-bold py-3 px-4 transition-all shadow-[0_4px_20px_rgba(234,179,8,0.3)]"
              >
                <span>↓</span>
                <span>Download Master</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleReset}
                className="rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-white/70 text-sm px-4 py-3 transition-all"
              >
                Retry
              </motion.button>
            </>
          )}
        </div>

        {/* Capability disclaimer */}
        <p className="text-[10px] text-white/20 text-center leading-relaxed">
          14-stage chain • HPSS stem separation • 4x oversampled true-peak • EBU R128 • QGE closed-loop
        </p>
      </div>
    </div>
  );
};

export default GrammyMasterPanel;
