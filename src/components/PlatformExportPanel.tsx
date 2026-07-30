/**
 * PlatformExportPanel
 *
 * Shows 8 streaming platform targets side by side.
 * For each: current LUFS delta, compliance badge, per-platform export.
 * "Export All" normalizes every platform variant and batch-downloads them.
 *
 * This is the finishing move �no other browser DAW does this.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  platformExportService,
  PLATFORM_SPECS,
  type PlatformExportResult,
  type PlatformSpec,
} from '../services/platformExportService';

interface PlatformExportPanelProps {
  masterBuffer: AudioBuffer | null;
  fileName?: string;
}

interface MeasurementState {
  integratedLUFS: number;
  truePeakDb: number;
  platformDeltas: Array<{ id: string; delta: number; compliant: boolean }>;
}

type ExportStatus = 'idle' | 'measuring' | 'exporting' | 'done' | 'error';

const LUFS_FORMAT = (v: number) =>
  Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : '—';

const DELTA_COLOR = (delta: number) => {
  const abs = Math.abs(delta);
  if (abs <= 0.5) return 'text-emerald-400';
  if (abs <= 2)   return 'text-amber-400';
  return 'text-red-400';
};

const DELTA_LABEL = (delta: number) => {
  if (Math.abs(delta) < 0.2) return 'Perfect';
  return delta > 0
    ? `+${delta.toFixed(1)} LU over`
    : `${Math.abs(delta).toFixed(1)} LU under`;
};

// ──�Platform Card ────────────────────────────────────────────────────────────

interface PlatformCardProps {
  spec: PlatformSpec;
  delta?: number;
  compliant?: boolean;
  isExporting: boolean;
  isDone: boolean;
  onExport: () => void;
}

const PlatformCard: React.FC<PlatformCardProps> = ({
  spec, delta, compliant, isExporting, isDone, onExport,
}) => {
  const measured = delta !== undefined;

  return (
    <motion.div
      layout
      className={`
        relative rounded-xl border overflow-hidden
        transition-all duration-200
        ${isDone
          ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
          : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07]'}
      `}
    >
      {/* Color accent strip */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-70"
        style={{ backgroundColor: spec.color }}
      />

      <div className="px-3 py-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            {/* Platform color dot */}
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: spec.color }}
            />
            <span className="text-[11px] font-semibold text-white/80 tracking-tight">
              {spec.name}
            </span>
          </div>
          {isDone && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium"
            >
              �Done
            </motion.span>
          )}
        </div>

        {/* Target LUFS */}
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-base font-bold text-white tabular-nums">
            {spec.targetLUFS}
          </span>
          <span className="text-[10px] text-white/40">LUFS</span>
          <span className="text-[9px] text-white/30 ml-auto">
            {spec.bitDepth}-bit
          </span>
        </div>

        {/* Delta from current master */}
        {measured ? (
          <div className="mb-2">
            <span className={`text-[10px] font-medium ${DELTA_COLOR(delta!)}`}>
              {DELTA_LABEL(delta!)}
            </span>
            {compliant && (
              <span className="text-[9px] text-emerald-400/70 ml-1">�compliant</span>
            )}
          </div>
        ) : (
          <div className="mb-2 h-4 rounded bg-white/[0.05] animate-pulse" />
        )}

        {/* Note */}
        <p className="text-[9px] text-white/25 leading-relaxed mb-2 line-clamp-2">
          {spec.note}
        </p>

        {/* Export button */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onExport}
          disabled={isExporting || isDone}
          className={`
            w-full text-[10px] font-semibold py-1.5 rounded-lg border
            transition-all duration-150
            ${isDone
              ? 'border-emerald-500/20 text-emerald-400/50 bg-emerald-500/10 cursor-default'
              : isExporting
                ? 'border-white/10 text-white/30 bg-white/[0.04] cursor-wait'
                : 'border-white/10 text-white/60 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white/90'}
          `}
        >
          {isDone ? '�Saved' : isExporting ? 'Normalizing…' : 'Export'}
        </motion.button>
      </div>
    </motion.div>
  );
};

// ──�Main Panel ───────────────────────────────────────────────────────────────

export const PlatformExportPanel: React.FC<PlatformExportPanelProps> = ({
  masterBuffer,
  fileName = 'master',
}) => {
  const [measurement, setMeasurement] = useState<MeasurementState | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [allExportProgress, setAllExportProgress] = useState(0);

  // Measure the master buffer whenever it changes
  useEffect(() => {
    if (!masterBuffer) {
      setMeasurement(null);
      setDoneIds(new Set());
      return;
    }

    setExportStatus('measuring');
    setError(null);

    platformExportService
      .measureMaster(masterBuffer)
      .then(m => {
        setMeasurement(m);
        setExportStatus('idle');
      })
      .catch(e => {
        setError((e as Error).message);
        setExportStatus('error');
      });
  }, [masterBuffer]);

  const handleExportOne = useCallback(
    async (spec: PlatformSpec) => {
      if (!masterBuffer || exportingId) return;
      setExportingId(spec.id);
      setError(null);

      try {
        const result = await platformExportService.exportForPlatform(masterBuffer, spec);
        platformExportService.downloadResult(result, fileName);
        setDoneIds(prev => new Set([...prev, spec.id]));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setExportingId(null);
      }
    },
    [masterBuffer, exportingId, fileName],
  );

  const handleExportAll = useCallback(async () => {
    if (!masterBuffer || exportStatus === 'exporting') return;
    setExportStatus('exporting');
    setAllExportProgress(0);
    setError(null);
    const completed = new Set<string>();

    try {
      const results = await platformExportService.exportAll(
        masterBuffer,
        (id, result) => {
          completed.add(id);
          setDoneIds(new Set(completed));
          setAllExportProgress(Math.round((completed.size / PLATFORM_SPECS.length) * 100));
          // Stagger downloads so browser doesn't block
          setTimeout(() => {
            platformExportService.downloadResult(result, fileName);
          }, completed.size * 250);
        },
      );
      setExportStatus('done');
      setAllExportProgress(100);
      void results; // already handled per-platform above
    } catch (e) {
      setError((e as Error).message);
      setExportStatus('error');
    }
  }, [masterBuffer, exportStatus, fileName]);

  const handleReset = useCallback(() => {
    setDoneIds(new Set());
    setExportStatus('idle');
    setAllExportProgress(0);
    setError(null);
  }, []);

  const lufs = measurement?.integratedLUFS;
  const tp   = measurement?.truePeakDb;
  const isMeasuring = exportStatus === 'measuring';
  const isExportingAll = exportStatus === 'exporting';
  const allDone = exportStatus === 'done';

  const baseName = fileName.replace(/\.[^.]+$/, '');

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-sm">
            🎛
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">
                Platform Export Suite
              </span>
              {isMeasuring && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 animate-pulse">
                  Measuring…
                </span>
              )}
              {allDone && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  �All Exported
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/40 mt-0.5">
              {lufs !== undefined && Number.isFinite(lufs)
                ? `Master: ${LUFS_FORMAT(lufs)} �Peak: ${tp !== undefined && Number.isFinite(tp) ? tp.toFixed(1) : '—'} dBTP`
                : masterBuffer
                  ? 'Analyzing loudness…'
                  : 'Load a master to begin'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allDone && (
            <button
              onClick={handleReset}
              className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              Reset
            </button>
          )}
          {!masterBuffer && (
            <span className="text-[10px] text-white/20">Waiting for master…</span>
          )}
        </div>
      </div>

      {/* Master LUFS bar �visual compliance overview */}
      {measurement && (
        <div className="px-4 py-2.5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-white/30 uppercase tracking-widest w-20 flex-shrink-0">
              Your master
            </span>
            <div className="flex-1 relative h-1.5 rounded-full bg-white/10 overflow-visible">
              {/* Range markers */}
              {[-23, -16, -14, -9, -8].map(target => {
                const pct = Math.max(0, Math.min(100, ((target - (-30)) / (0 - (-30))) * 100));
                return (
                  <div
                    key={target}
                    className="absolute top-0 bottom-0 w-px bg-white/20"
                    style={{ left: `${pct}%` }}
                  />
                );
              })}
              {/* Current LUFS indicator */}
              {Number.isFinite(lufs!) && (
                <motion.div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-violet-400 shadow-lg"
                  style={{
                    left: `${Math.max(0, Math.min(100, ((lufs! - (-30)) / (0 - (-30))) * 100))}%`,
                    translateX: '-50%',
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                />
              )}
            </div>
            <span className="text-[9px] text-white/30 w-4">0</span>
          </div>
          <div className="flex justify-between mt-0.5 px-0">
            <span className="text-[8px] text-white/20">-30 LUFS</span>
            <span className="text-[8px] text-white/20 ml-auto">0 LUFS</span>
          </div>
        </div>
      )}

      {/* Platform grid */}
      <div className="p-3 grid grid-cols-4 gap-2">
        {PLATFORM_SPECS.map(spec => {
          const delta = measurement?.platformDeltas.find(d => d.id === spec.id);
          return (
            <PlatformCard
              key={spec.id}
              spec={spec}
              delta={delta?.delta}
              compliant={delta?.compliant}
              isExporting={exportingId === spec.id || isExportingAll}
              isDone={doneIds.has(spec.id)}
              onExport={() => void handleExportOne(spec)}
            />
          );
        })}
      </div>

      {/* Export All bar */}
      <div className="px-4 pb-4 pt-1">
        <AnimatePresence mode="wait">
          {isExportingAll ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between text-[10px] text-white/50">
                <span>Exporting {doneIds.size} / {PLATFORM_SPECS.length} platforms…</span>
                <span>{allExportProgress}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-violet-500"
                  animate={{ width: `${allExportProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="export-all"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void handleExportAll()}
              disabled={!masterBuffer || isMeasuring || allDone}
              className={`
                w-full py-2.5 rounded-xl text-xs font-semibold border
                transition-all duration-150
                ${allDone
                  ? 'border-emerald-500/20 text-emerald-400/50 bg-emerald-500/10 cursor-default'
                  : !masterBuffer || isMeasuring
                    ? 'border-white/10 text-white/20 cursor-not-allowed'
                    : 'border-violet-500/30 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.1)] hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]'}
              `}
            >
              {allDone
                ? `�All ${PLATFORM_SPECS.length} Platforms Exported`
                : `Export All ${PLATFORM_SPECS.length} Platforms �${PLATFORM_SPECS.map(s => s.name).join(', ')}`}
            </motion.button>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-2 text-[10px] text-red-400/80 text-center">{error}</p>
        )}

        {!allDone && masterBuffer && (
          <p className="mt-2 text-[9px] text-white/20 text-center">
            Each platform normalized to its exact LUFS target �true-peak limited �named with platform + bit depth
          </p>
        )}
      </div>
    </div>
  );
};

export default PlatformExportPanel;
