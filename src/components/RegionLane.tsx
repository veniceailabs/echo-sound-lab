import React, { useEffect, useRef, useState } from 'react';
import type { ReplayRegionState, ReplayTrackState } from '../services/deterministicReplayService';
import { assetRegistry } from '../services/AssetRegistry';

interface RegionLaneProps {
  track: ReplayTrackState;
  regions: ReplayRegionState[];
  pxPerSec: number;
  laneWidth: number;
  isReadOnly?: boolean;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onMoveRegion: (region: ReplayRegionState, nextStartSec: number) => void;
  onSplitRegion: (region: ReplayRegionState, splitTimeSec: number) => void;
  showPlayhead?: boolean;
}

interface RegionWaveformProps {
  assetId: string;
  width: number;
  height: number;
}

function RegionWaveform({ assetId, width, height }: RegionWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(() => assetRegistry.getWaveformPeaks(assetId, 192));

  useEffect(() => {
    let cancelled = false;
    const cached = assetRegistry.getWaveformPeaks(assetId, 192);
    if (cached) {
      setPeaks(cached);
      return () => {
        cancelled = true;
      };
    }

    void assetRegistry.ensureDecodedBuffer(assetId).then(() => {
      if (cancelled) return;
      setPeaks(assetRegistry.getWaveformPeaks(assetId, 192));
    });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawWidth = Math.max(1, Math.floor(width));
    const drawHeight = Math.max(1, Math.floor(height));
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(drawWidth * dpr);
    canvas.height = Math.floor(drawHeight * dpr);
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, drawWidth, drawHeight);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, 0, drawWidth, drawHeight);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1;

    const centerY = drawHeight / 2;
    if (!peaks || peaks.length === 0) {
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(drawWidth, centerY);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < peaks.length; i += 1) {
      const x = peaks.length > 1 ? (i / (peaks.length - 1)) * drawWidth : 0;
      const amp = Math.max(0, Math.min(1, peaks[i]));
      const y = centerY - amp * (drawHeight * 0.45);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = peaks.length - 1; i >= 0; i -= 1) {
      const x = peaks.length > 1 ? (i / (peaks.length - 1)) * drawWidth : 0;
      const amp = Math.max(0, Math.min(1, peaks[i]));
      const y = centerY + amp * (drawHeight * 0.45);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();
    ctx.stroke();
  }, [height, peaks, width]);

  return (
    <canvas
      ref={canvasRef}
      className="mt-1 rounded border border-white/10 bg-slate-900/80"
      aria-label={`waveform-${assetId}`}
    />
  );
}

function RegionLaneComponent({
  track,
  regions,
  pxPerSec,
  laneWidth,
  isReadOnly = false,
  selectedRegionId,
  onSelectRegion,
  onMoveRegion,
  onSplitRegion,
  showPlayhead = false,
}: RegionLaneProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Regions</p>
        <p className="text-[10px] text-slate-500">{track.trackId}</p>
      </div>
      <div
        className="relative overflow-hidden rounded-lg border border-white/5 bg-slate-900/70"
        style={{ width: `${laneWidth}px`, minHeight: '54px' }}
      >
        {showPlayhead && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-cyan-300/80"
            style={{ left: 'var(--timeline-playhead-left, 0px)' }}
          />
        )}
        {regions.map((region) => {
          const left = Math.max(0, region.startTimeSec * pxPerSec);
          const width = Math.max(36, region.durationSec * pxPerSec);
          const splitTimeSec = region.startTimeSec + Math.max(region.durationSec / 2, 0.25);
          const isSelected = selectedRegionId === region.regionId;

          return (
            <div
              key={region.regionId}
              className={`absolute top-2 rounded-lg border px-2 py-1 shadow-sm ${
                isSelected
                  ? 'border-cyan-300/70 bg-cyan-500/20'
                  : 'border-orange-300/40 bg-orange-500/15'
              }`}
              style={{ left: `${left}px`, width: `${width}px` }}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelectRegion(region.regionId)}
              >
                <p className="truncate text-[11px] font-semibold text-slate-100">{region.regionId}</p>
                <p className="text-[10px] text-slate-300">
                  {region.startTimeSec.toFixed(2)}s → {(region.startTimeSec + region.durationSec).toFixed(2)}s
                </p>
              </button>
              <RegionWaveform
                assetId={region.sourceId}
                width={Math.max(24, width - 16)}
                height={18}
              />
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => onMoveRegion(region, Number((region.startTimeSec + 1).toFixed(3)))}
                  disabled={isReadOnly}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +1s
                </button>
                <button
                  type="button"
                  onClick={() => onSplitRegion(region, Number(splitTimeSec.toFixed(3)))}
                  disabled={isReadOnly}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Split
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const RegionLane = React.memo(RegionLaneComponent);

export default RegionLane;
