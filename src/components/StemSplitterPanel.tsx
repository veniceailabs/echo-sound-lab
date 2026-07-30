import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  stemSeparationService,
  type SeparatedStems,
  type SeparationState,
} from '../services/stemSeparationService';
import type { ProofTrainerSessionManifest } from '../services/sessionAlignmentService';

interface Props {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

type StemKey = 'vocals' | 'bass' | 'drums' | 'other';

const STEM_META: Record<StemKey, { label: string; colorClass: string; waveColor: string; desc: string }> = {
  vocals: {
    label: 'Vocals',
    colorClass: 'border-cyan-500/20 bg-cyan-500/[0.03] text-cyan-300',
    waveColor: '#22d3ee',
    desc: 'Center-forward vocal energy and lead content',
  },
  bass: {
    label: 'Bass',
    colorClass: 'border-fuchsia-500/20 bg-fuchsia-500/[0.03] text-fuchsia-300',
    waveColor: '#d946ef',
    desc: 'Low-end harmonic foundation and bass movement',
  },
  drums: {
    label: 'Drums',
    colorClass: 'border-amber-500/20 bg-amber-500/[0.03] text-amber-300',
    waveColor: '#f59e0b',
    desc: 'Percussive transients and groove information',
  },
  other: {
    label: 'Other',
    colorClass: 'border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-300',
    waveColor: '#10b981',
    desc: 'Remaining harmonic instruments and support layers',
  },
};

function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const nc = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const n = buf.length;
  const ab = new ArrayBuffer(44 + n * nc * 2);
  const view = new DataView(ab);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, ab.byteLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, nc, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * nc * 2, true);
  view.setUint16(32, nc * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, n * nc * 2, true);

  const out = new Int16Array(ab, 44);
  for (let i = 0; i < n; i += 1) {
    for (let ch = 0; ch < nc; ch += 1) {
      const sample = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i] ?? 0));
      out[i * nc + ch] = sample < 0 ? sample * 32768 : sample * 32767;
    }
  }

  return ab;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function drawWave(canvas: HTMLCanvasElement, buffer: AudioBuffer, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const data = buffer.getChannelData(0);
  const width = canvas.width;
  const height = canvas.height;
  const step = Math.max(1, Math.floor(data.length / width));

  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `${color}cc`;

  for (let x = 0; x < width; x += 1) {
    let peak = 0;
    for (let i = x * step; i < Math.min(data.length, (x + 1) * step); i += 1) {
      peak = Math.max(peak, Math.abs(data[i] ?? 0));
    }
    const barHeight = peak * (height / 2);
    ctx.fillRect(x, height / 2 - barHeight, 1, barHeight * 2);
  }
}

function formatMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export const StemSplitterPanel: React.FC<Props> = ({ buffer, onClose }) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [separationState, setSeparationState] = useState<SeparationState | null>(null);
  const [stems, setStems] = useState<SeparatedStems | null>(null);
  const [playing, setPlaying] = useState<StemKey | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const canvasRefs = {
    vocals: useRef<HTMLCanvasElement>(null),
    bass: useRef<HTMLCanvasElement>(null),
    drums: useRef<HTMLCanvasElement>(null),
    other: useRef<HTMLCanvasElement>(null),
  };

  const stopPreview = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current = null;
    }
    if (contextRef.current) {
      void contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }
    setPlaying(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  useEffect(() => {
    if (!stems) return;
    (Object.keys(STEM_META) as StemKey[]).forEach((key) => {
      const canvas = canvasRefs[key].current;
      if (!canvas) return;
      drawWave(canvas, stems[key], STEM_META[key].waveColor);
    });
  }, [stems]);

  const process = useCallback(async () => {
    if (!buffer) return;
    setStatus('processing');
    setStems(null);
    setSeparationState(null);

    await new Promise((resolve) => setTimeout(resolve, 20));

    try {
      await stemSeparationService.initialize('esl-hpss');
      const { stems: separated } = await stemSeparationService.processAudioFile(buffer, (nextState) => {
        setSeparationState({ ...nextState });
      });
      setStems(separated);
      setStatus('done');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  }, [buffer]);

  const playStem = useCallback((key: StemKey) => {
    if (!stems) return;
    if (playing === key) {
      stopPreview();
      return;
    }

    stopPreview();
    const context = new AudioContext();
    const source = context.createBufferSource();
    source.buffer = stems[key];
    source.connect(context.destination);
    source.onended = () => setPlaying((current) => (current === key ? null : current));
    source.start();
    contextRef.current = context;
    sourceRef.current = source;
    setPlaying(key);
  }, [playing, stems, stopPreview]);

  const downloadStem = useCallback((key: StemKey) => {
    if (!stems) return;
    const blob = new Blob([encodeWav(stems[key])], { type: 'audio/wav' });
    downloadBlob(blob, `stem_${key}.wav`);
  }, [stems]);

  const downloadAll = useCallback(() => {
    if (!stems) return;
    (Object.keys(STEM_META) as StemKey[]).forEach((key) => {
      const blob = new Blob([encodeWav(stems[key])], { type: 'audio/wav' });
      downloadBlob(blob, `stem_${key}.wav`);
    });
  }, [stems]);

  const downloadManifest = useCallback(() => {
    const manifest = stems?.metadata.alignmentManifest;
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'stem_alignment_manifest.json');
  }, [stems]);

  const manifest: ProofTrainerSessionManifest | null = stems?.metadata.alignmentManifest ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-white">Stem Splitter</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">Local HPSS split plus session alignment metadata</p>
          </div>
          <div className="flex gap-2">
            {stems && (
              <>
                <button
                  onClick={downloadManifest}
                  className="rounded-lg border border-cyan-500/30 px-2 py-1 text-[9px] text-cyan-300 transition-all hover:bg-cyan-500/10"
                >
                  Manifest
                </button>
                <button
                  onClick={downloadAll}
                  className="rounded-lg border border-emerald-500/30 px-2 py-1 text-[9px] text-emerald-300 transition-all hover:bg-emerald-500/10"
                >
                  All Stems
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.05] text-xs text-slate-500 transition-all hover:bg-white/10 hover:text-white"
            >
              x
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!buffer && <p className="py-8 text-center text-sm text-amber-400">Load a track first.</p>}
          {buffer && (
            <>
              <button
                onClick={process}
                disabled={status === 'processing'}
                className="w-full rounded-xl border border-cyan-500/15 bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-200 transition-all hover:text-white disabled:opacity-40"
              >
                {status === 'processing'
                  ? `${separationState?.statusMessage || 'Processing stems'} ${Math.round((separationState?.progress ?? 0))}%`
                  : status === 'done'
                    ? 'Split Again'
                    : 'Split Stems'}
              </button>

              <AnimatePresence>
                {status === 'processing' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1">
                    <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400"
                        animate={{ width: `${separationState?.progress ?? 0}%` }}
                        transition={{ ease: 'linear', duration: 0.1 }}
                      />
                    </div>
                    <p className="text-center text-[8px] text-slate-600">{separationState?.step || 'separating'}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {manifest && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Local Alignment</p>
                      <p className="mt-1 text-sm text-slate-200">
                        Anchor `{manifest.anchor_track_id ?? 'auto'}` with session zero at {formatMs(manifest.session_zero_ms)}.
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <div>{manifest.summary.track_count} tracks</div>
                      <div>{formatMs(manifest.duration_ms)} total session span</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] text-slate-300">
                      <div className="text-slate-500">Comp lanes</div>
                      <div className="mt-1 font-semibold text-cyan-100">{manifest.summary.comp_lane_count}</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] text-slate-300">
                      <div className="text-slate-500">Candidate takes</div>
                      <div className="mt-1 font-semibold text-cyan-100">{manifest.summary.candidate_take_count}</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] text-slate-300">
                      <div className="text-slate-500">Assembled slices</div>
                      <div className="mt-1 font-semibold text-cyan-100">{manifest.summary.assembled_segment_count}</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {manifest.tracks.map((track) => {
                      const left = manifest.duration_ms > 0 ? (track.start_timestamp_ms / manifest.duration_ms) * 100 : 0;
                      const width = manifest.duration_ms > 0 ? Math.max(2, ((track.trim_end_ms - track.trim_start_ms) / manifest.duration_ms) * 100) : 100;
                      return (
                        <div key={track.trackId} className="rounded-lg border border-white/[0.06] bg-black/20 p-2">
                          <div className="flex items-center justify-between gap-3 text-[11px]">
                            <div className="font-semibold text-slate-200">{track.fileName}</div>
                            <div className="text-slate-500">
                              Start {formatMs(track.start_timestamp_ms)} | Trim {formatMs(track.trim_start_ms)} to {formatMs(track.trim_end_ms)}
                            </div>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-white/[0.05]">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/70"
                              style={{ marginLeft: `${left}%`, width: `${Math.min(100 - left, width)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {manifest.comp_lanes.length > 0 && (
                    <div className="mt-4 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200">Comp Plan</p>
                          <p className="mt-1 text-[11px] text-slate-300">
                            ESL selected primary takes and assembled segment slices from the separated session.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {manifest.comp_lanes.map((lane) => (
                          <div key={lane.lane_id} className="rounded-lg border border-white/[0.06] bg-black/20 p-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="font-semibold text-slate-100">
                                {lane.section_name} · {lane.lane_role}
                              </div>
                              <div className="text-slate-500">
                                {lane.candidates.length} candidates · {lane.assembled_segments.length} assembled slice{lane.assembled_segments.length === 1 ? '' : 's'}
                              </div>
                            </div>
                            <div className="mt-2 space-y-1">
                              {lane.assembled_segments.map((segment) => (
                                <div key={segment.segment_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-white/[0.03] px-2 py-1 text-[10px] text-slate-300">
                                  <div className="font-medium text-fuchsia-100">{segment.file_name}</div>
                                  <div className="text-slate-500">
                                    {formatMs(segment.comp_start_ms)} to {formatMs(segment.comp_end_ms)} · score {(segment.score * 100).toFixed(0)}%
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <AnimatePresence>
                {stems && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    {(Object.keys(STEM_META) as StemKey[]).map((key) => {
                      const meta = STEM_META[key];
                      const isPlaying = playing === key;
                      return (
                        <div key={key} className={`overflow-hidden rounded-xl border ${meta.colorClass}`}>
                          <div className="flex items-center gap-3 px-3 pb-1 pt-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold">{meta.label}</p>
                              <p className="text-[7px] text-slate-500">{meta.desc}</p>
                            </div>
                            <button
                              onClick={() => playStem(key)}
                              className={`rounded-lg border px-2 py-1 text-[8px] transition-all ${isPlaying ? 'border-current bg-white/[0.05] text-white' : 'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}
                            >
                              {isPlaying ? 'Stop' : 'Preview'}
                            </button>
                            <button
                              onClick={() => downloadStem(key)}
                              className="rounded-lg border border-white/[0.06] px-2 py-1 text-[8px] text-slate-400 transition-all hover:text-slate-200"
                            >
                              WAV
                            </button>
                          </div>
                          <canvas ref={canvasRefs[key]} width={900} height={44} className="w-full bg-[#0a0f1a]" />
                        </div>
                      );
                    })}

                    <p className="text-center text-[8px] leading-relaxed text-slate-600">
                      These stems now carry a local alignment manifest, so timing metadata survives separation instead of resetting every lane to zero.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StemSplitterPanel;
