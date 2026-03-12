import React from 'react';
import { useTranslation } from 'react-i18next';

interface TransportBarProps {
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  isBusy?: boolean;
  isExporting?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek?: (timeSec: number) => void;
  onExportWav?: () => void;
}

function formatTransportTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.floor((clamped - Math.floor(clamped)) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(millis).padStart(3, '0')}`;
}

export default function TransportBar({
  isPlaying,
  currentTimeSec,
  durationSec,
  isBusy = false,
  isExporting = false,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onExportWav,
}: TransportBarProps) {
  const safeDuration = Math.max(durationSec, 0);
  const safeCurrent = Math.max(0, Math.min(currentTimeSec, safeDuration || currentTimeSec));
  const progressValue = safeDuration > 0 ? safeCurrent : 0;
  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPlay}
            disabled={isBusy || isPlaying}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('transport.play', { defaultValue: 'Play' })}
          </button>
          <button
            type="button"
            onClick={onPause}
            disabled={isBusy || !isPlaying}
            className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('transport.pause', { defaultValue: 'Pause' })}
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={isBusy || (safeCurrent <= 0 && !isPlaying)}
            className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('transport.stop', { defaultValue: 'Stop' })}
          </button>
          <button
            type="button"
            onClick={onExportWav}
            disabled={isBusy || isExporting || !onExportWav}
            className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting
              ? t('transport.rendering', { defaultValue: 'Rendering…' })
              : t('transport.exportWav', { defaultValue: 'Export WAV' })}
          </button>
        </div>

        <div className="font-mono text-xs text-slate-300">
          {formatTransportTime(safeCurrent)} / {formatTransportTime(safeDuration)}
        </div>

        <div className="min-w-[180px] flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(safeDuration, 0)}
            step={0.001}
            value={progressValue}
            onChange={(event) => onSeek?.(Number(event.target.value))}
            disabled={isBusy || !onSeek || safeDuration <= 0}
            className="w-full accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('transport.seekLabel', { defaultValue: 'Timeline playhead seek' })}
          />
        </div>
      </div>
    </section>
  );
}
