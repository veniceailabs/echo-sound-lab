import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { downloadText } from '../services/cueSheetExporter';
import {
  clearStudioFlashbackSnapshots,
  getLatestStudioFlashbackSnapshot,
  serializeStudioFlashbackManifestJson,
  type StudioFlashbackCaptureSnapshot,
} from '../services/studioFlashbackCaptureService';

interface StudioFlashbackPanelProps {
  snapshots: StudioFlashbackCaptureSnapshot[];
  currentFileName: string | null;
  currentPlayheadSeconds: number;
  isPlaying: boolean;
  chainSignature: string | null;
  renderPath: string | null;
  onCapture: () => void;
  onRestore: (snapshot: StudioFlashbackCaptureSnapshot) => void;
  onRefresh: () => void;
}

const actionButtonClass = 'rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0.00';
  return seconds.toFixed(2);
}

export function StudioFlashbackPanel(props: StudioFlashbackPanelProps) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const latest = useMemo(() => getLatestStudioFlashbackSnapshot(), [props.snapshots]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(9,14,28,0.98),rgba(6,10,20,0.94))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">Flashback Capture</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Capture the last good moment, then get back to work.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            ESL keeps a rolling in-memory bank of recent audio states so you can snapshot, review, and restore without losing the creative thread.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Snapshots</div>
          <div className="mt-1 text-lg font-semibold text-white">{props.snapshots.length}</div>
          <div className="mt-1 text-xs text-slate-400">
            {latest ? `Latest: ${latest.label}` : 'No flashback captures yet.'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={props.onCapture} className={actionButtonClass}>
          Capture Now
        </button>
        <button
          type="button"
          onClick={() => {
            const latestSnapshot = getLatestStudioFlashbackSnapshot();
            if (latestSnapshot) props.onRestore(latestSnapshot);
          }}
          className={actionButtonClass}
        >
          Restore Latest
        </button>
        <button
          type="button"
          onClick={() => {
            downloadText(
              serializeStudioFlashbackManifestJson(props.snapshots),
              'studio-flashback-manifest.json',
              'application/json'
            );
          }}
          className={actionButtonClass}
        >
          Export Manifest
        </button>
        <button
          type="button"
          onClick={() => {
            clearStudioFlashbackSnapshots();
            props.onRefresh();
          }}
          className={actionButtonClass}
        >
          Clear Flashback Bank
        </button>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Current capture state</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>Session: {props.currentFileName || 'Untitled'}</p>
            <p>Playhead: {formatTime(props.currentPlayheadSeconds)} sec</p>
            <p>Render path: {props.renderPath || 'n/a'}</p>
            <p>Chain: {props.chainSignature || 'n/a'}</p>
            <p>Transport: {props.isPlaying ? 'Playing' : 'Stopped'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent snapshots</p>
          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
            {props.snapshots.length === 0 ? (
              <p className="text-xs text-slate-500">No captures yet. Capture one from the current session.</p>
            ) : (
              props.snapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{snapshot.label}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        {snapshot.sourceFileName || 'Untitled'} · {new Date(snapshot.capturedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onRestore(snapshot)}
                      className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
                    >
                      Restore
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <p>Playhead {formatTime(snapshot.playheadSeconds)} sec</p>
                    <p>{snapshot.durationSec.toFixed(2)} sec</p>
                    <p>{snapshot.channelCount} ch</p>
                    <p>{snapshot.sampleRate} Hz</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default React.memo(StudioFlashbackPanel);
