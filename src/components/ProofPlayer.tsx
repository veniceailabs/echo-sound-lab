import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface ProofPlayerProps {
  beforeSrc?: string;
  afterSrc?: string;
  beforeLabel?: string;
  afterLabel?: string;
  title?: string;
  subtitle?: string;
  previewSeconds?: number;
  previewBadge?: string;
  className?: string;
}

type LoadStatus = 'loading' | 'ready' | 'error';

function seedWaveform(seed: string, width = 96): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const values: number[] = [];
  let current = hash || 1;
  for (let i = 0; i < width; i++) {
    current = (current * 1664525 + 1013904223) >>> 0;
    const normalized = (current & 0xffff) / 0xffff;
    values.push(0.12 + normalized * 0.88);
  }
  return values;
}

function drawWaveform(canvas: HTMLCanvasElement, source: AudioBuffer | null, accent: string, seed: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const bars = source ? Array.from({ length: width }, (_, index) => {
    const data = source.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(data.length / width));
    const start = index * samplesPerBar;
    const end = Math.min(data.length, start + samplesPerBar);
    let peak = 0;
    for (let i = start; i < end; i++) {
      peak = Math.max(peak, Math.abs(data[i] ?? 0));
    }
    return Math.max(0.05, peak);
  }) : seedWaveform(seed, width);

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, `${accent}18`);
  grad.addColorStop(0.5, `${accent}66`);
  grad.addColorStop(1, `${accent}18`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const mid = height / 2;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let x = 0; x < bars.length; x++) {
    const peak = bars[x] ?? 0.1;
    const barHeight = peak * (height * 0.42);
    ctx.lineTo(x, mid - barHeight);
  }
  for (let x = bars.length - 1; x >= 0; x--) {
    const peak = bars[x] ?? 0.1;
    const barHeight = peak * (height * 0.42);
    ctx.lineTo(x, mid + barHeight);
  }
  ctx.closePath();
  ctx.fillStyle = `${accent}55`;
  ctx.fill();

  ctx.strokeStyle = `${accent}cc`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let x = 0; x < bars.length; x++) {
    const peak = bars[x] ?? 0.1;
    const barHeight = peak * (height * 0.42);
    if (x === 0) ctx.moveTo(x, mid - barHeight);
    else ctx.lineTo(x, mid - barHeight);
  }
  ctx.stroke();
}

function WaveformPanel({
  src,
  accent,
  label,
  fallbackSeed,
}: {
  src: string;
  accent: string;
  label: string;
  fallbackSeed: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      try {
        const response = await fetch(src, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const bytes = await response.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(bytes.slice(0));
        await ctx.close();
        if (cancelled) return;
        setBuffer(decoded);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setBuffer(null);
        setStatus('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawWaveform(canvasRef.current, buffer, accent, fallbackSeed);
  }, [buffer, accent, fallbackSeed]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
        <p className="text-[9px] uppercase tracking-[0.22em] text-slate-600">
          {status === 'ready' ? 'loaded' : status === 'error' ? 'fallback' : 'loading'}
        </p>
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={140}
        className="h-[140px] w-full rounded-[1.25rem] border border-white/10 bg-black/20"
        aria-hidden="true"
      />
    </div>
  );
}

const ProofPlayer: React.FC<ProofPlayerProps> = ({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  title = 'A/B proof',
  subtitle = 'Load a rendered session to compare the before and after audio with a single crossfade handle.',
  previewSeconds,
  previewBadge,
  className = '',
}) => {
  const beforeAudioRef = useRef<HTMLAudioElement | null>(null);
  const afterAudioRef = useRef<HTMLAudioElement | null>(null);
  const [mix, setMix] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const leftVolume = useMemo(() => 1 - (mix / 100), [mix]);
  const rightVolume = useMemo(() => mix / 100, [mix]);
  const hasProofSources = Boolean(beforeSrc && afterSrc);
  const previewDuration = useMemo(() => {
    if (typeof previewSeconds === 'number' && Number.isFinite(previewSeconds) && previewSeconds > 0) {
      return previewSeconds;
    }
    return null;
  }, [previewSeconds]);

  useEffect(() => {
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    if (!before || !after) return;
    before.volume = leftVolume;
    after.volume = rightVolume;
  }, [leftVolume, rightVolume]);

  const syncDuration = () => {
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    const nextDuration = Math.max(before?.duration || 0, after?.duration || 0);
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      setDuration(previewDuration ? Math.min(nextDuration, previewDuration) : nextDuration);
    }
  };

  const handlePlayPause = async () => {
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    if (!before || !after) return;

    if (isPlaying) {
      before.pause();
      after.pause();
      setIsPlaying(false);
      return;
    }

    try {
      const startTime = currentTime > 0 ? currentTime : 0;
      const clampedStart = previewDuration ? Math.min(startTime, Math.max(0, previewDuration - 0.01)) : startTime;
      before.currentTime = clampedStart;
      after.currentTime = clampedStart;
      before.volume = leftVolume;
      after.volume = rightVolume;
      await Promise.all([before.play(), after.play()]);
      setStatus('ready');
      setError(null);
      setIsPlaying(true);
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : 'Could not start playback');
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const before = beforeAudioRef.current;
    if (!before) return;
    if (previewDuration && before.currentTime >= previewDuration) {
      before.pause();
      const after = afterAudioRef.current;
      after?.pause();
      before.currentTime = previewDuration;
      if (after) {
        after.currentTime = previewDuration;
      }
      setCurrentTime(previewDuration);
      setIsPlaying(false);
      return;
    }
    setCurrentTime(before.currentTime);
  };

  useEffect(() => {
    const before = beforeAudioRef.current;
    const after = afterAudioRef.current;
    if (!before || !after) return;

    const onCanPlay = () => {
      syncDuration();
      setStatus('ready');
      setError(null);
    };

    const onError = () => {
      setStatus('error');
      setError('Benchmark assets are unavailable. The player will remain responsive once assets are added.');
    };

    const onEnded = () => setIsPlaying(false);

    before.addEventListener('timeupdate', handleTimeUpdate);
    before.addEventListener('ended', onEnded);
    after.addEventListener('ended', onEnded);
    before.addEventListener('canplay', onCanPlay);
    after.addEventListener('canplay', onCanPlay);
    before.addEventListener('loadedmetadata', onCanPlay);
    after.addEventListener('loadedmetadata', onCanPlay);
    before.addEventListener('error', onError);
    after.addEventListener('error', onError);

    return () => {
      before.removeEventListener('timeupdate', handleTimeUpdate);
      before.removeEventListener('ended', onEnded);
      after.removeEventListener('ended', onEnded);
      before.removeEventListener('canplay', onCanPlay);
      after.removeEventListener('canplay', onCanPlay);
      before.removeEventListener('loadedmetadata', onCanPlay);
      after.removeEventListener('loadedmetadata', onCanPlay);
      before.removeEventListener('error', onError);
      after.removeEventListener('error', onError);
    };
  }, []);

  return (
    <div className={`rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/75">{title}</p>
          <h3 className="mt-2 text-xl font-bold text-white">
            {hasProofSources ? 'Before / after proof' : 'No proof session loaded'}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {hasProofSources ? (
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
              Proof ready
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
              Awaiting render
            </div>
          )}
          {previewBadge && (
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              {previewBadge}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {hasProofSources ? (
          <div className="grid gap-4 md:grid-cols-2">
            <WaveformPanel src={beforeSrc as string} accent="#60a5fa" label={beforeLabel} fallbackSeed="proof-before" />
            <WaveformPanel src={afterSrc as string} accent="#f97316" label={afterLabel} fallbackSeed="proof-after" />
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">No rendered proof is attached yet.</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Open the studio and render a session to populate this comparison view with real audio.
            </p>
          </div>
        )}

        {hasProofSources && (
          <div className="relative rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.28em] text-slate-500">
              <span>Before</span>
              <span>After</span>
            </div>
            <div className="relative mt-4 h-2 rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-orange-400"
                style={{ width: `${mix}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={mix}
                onChange={(event) => setMix(Number(event.target.value))}
                className="absolute inset-0 h-2 w-full cursor-ew-resize appearance-none bg-transparent"
                aria-label="Before after mix"
              />
              <div
                className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                style={{ left: `${mix}%` }}
              >
                <div className="h-8 w-8 -translate-x-1/2 rounded-full border border-white/20 bg-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)]" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span>{beforeLabel}</span>
              <span>{mix}% / {100 - mix}%</span>
              <span>{afterLabel}</span>
            </div>
          </div>
        )}

        {hasProofSources && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void handlePlayPause()}
              className="rounded-2xl bg-gradient-to-r from-cyan-500 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(34,211,238,0.18)] transition hover:translate-y-[-1px]"
            >
              {isPlaying ? 'Pause proof' : 'Play proof'}
            </button>
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {status === 'ready' ? 'ready' : status}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {duration > 0 ? `${Math.max(0, duration - currentTime).toFixed(1)}s left` : 'loading audio'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-amber-300/90">{error}</p>
        )}
      </div>

      {hasProofSources && (
        <>
          <audio ref={beforeAudioRef} src={beforeSrc as string} preload="auto" />
          <audio ref={afterAudioRef} src={afterSrc as string} preload="auto" />
        </>
      )}
    </div>
  );
};

export default ProofPlayer;
