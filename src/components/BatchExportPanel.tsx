/**
 * BatchExportPanel ‚ÄExport all tracks in one click
 *
 * Iterates over all tracks with recorded takes and exports each one
 * as a WAV file. The export happens sequentially with progress tracking.
 *
 * Options:
 * - Bit depth: 16-bit PCM or 32-bit float
 * - Normalize each track to a target LUFS before export
 * - Add track number prefix to filename
 * - Fade in / fade out applied to each track
 *
 * Each track downloads as a separate WAV. A completion summary shows
 * which tracks exported successfully and which had no takes.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { injectWavMetadata } from '../services/audioMetadataWriter';

interface TrackInfo {
  id: string;
  name: string;
  regions: Array<{
    takes: Array<{ blob: Blob }>;
    activeTaskIdx: number;
  }>;
}

interface BatchExportPanelProps {
  tracks: TrackInfo[];
  sessionName?: string;
  onClose: () => void;
}

interface ExportSettings {
  bitDepth: 16 | 32;
  normalize: boolean;
  targetLufs: number;
  fadeIn: number;
  fadeOut: number;
  prefixNumber: boolean;
}

type TrackStatus = 'pending' | 'exporting' | 'done' | 'skipped' | 'error';

function applyFade(data: Float32Array, fadeInSamples: number, fadeOutSamples: number): Float32Array {
  const out = new Float32Array(data);
  const n = out.length;
  for (let i = 0; i < Math.min(fadeInSamples, n); i++) out[i] *= i / fadeInSamples;
  for (let i = 0; i < Math.min(fadeOutSamples, n); i++) out[n - 1 - i] *= i / fadeOutSamples;
  return out;
}

function normalizeBuffer(buf: AudioBuffer, targetLufs: number): AudioBuffer {
  // Estimate RMS across all channels
  let sumSq = 0; let count = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) { sumSq += ch[i] * ch[i]; count++; }
  }
  const rms = Math.sqrt(sumSq / count);
  const currentLufs = rms > 0 ? 20 * Math.log10(rms) - 0.691 : -96;
  const gainDb = targetLufs - currentLufs;
  const gain = Math.pow(10, gainDb / 20);

  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const inData = buf.getChannelData(c);
    const outData = out.getChannelData(c);
    for (let i = 0; i < inData.length; i++) outData[i] = Math.max(-1, Math.min(1, inData[i] * gain));
  }
  return out;
}

function encodeWav16(buf: AudioBuffer, fadeIn: number, fadeOut: number): ArrayBuffer {
  const numCh = buf.numberOfChannels;
  const n = buf.length;
  const rate = buf.sampleRate;
  const fadeInSamples = Math.round(fadeIn * rate);
  const fadeOutSamples = Math.round(fadeOut * rate);
  const dataSize = n * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); view.setUint32(4,36+dataSize,true); ws(8,'WAVE'); ws(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,numCh,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*numCh*2,true);
  view.setUint16(32,numCh*2,true); view.setUint16(34,16,true);
  ws(36,'data'); view.setUint32(40,dataSize,true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) {
    const raw = new Float32Array(buf.getChannelData(c));
    channels.push(fadeInSamples > 0 || fadeOutSamples > 0 ? applyFade(raw, fadeInSamples, fadeOutSamples) : raw);
  }

  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
  }
  return ab;
}

function encodeWav32(buf: AudioBuffer, fadeIn: number, fadeOut: number): ArrayBuffer {
  const numCh = buf.numberOfChannels;
  const n = buf.length;
  const rate = buf.sampleRate;
  const fadeInSamples = Math.round(fadeIn * rate);
  const fadeOutSamples = Math.round(fadeOut * rate);
  const dataSize = n * numCh * 4;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); view.setUint32(4,36+dataSize,true); ws(8,'WAVE'); ws(12,'fmt ');
  view.setUint32(16,18,true); view.setUint16(20,3,true); // IEEE float
  view.setUint16(22,numCh,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*numCh*4,true);
  view.setUint16(32,numCh*4,true); view.setUint16(34,32,true);
  view.setUint16(44,0,true); // cbSize
  ws(36,'data'); view.setUint32(40,dataSize,true);

  // For 32-bit float, we need to extend the header properly
  // Simple approach: use standard 44-byte header with float format
  const ab2 = new ArrayBuffer(44 + dataSize);
  const v2 = new DataView(ab2);
  ws(0,'RIFF'); v2.setUint32(4,36+dataSize,true); ws(8,'WAVE'); ws(12,'fmt ');
  v2.setUint32(16,16,true); v2.setUint16(20,3,true);
  v2.setUint16(22,numCh,true);
  v2.setUint32(24,rate,true); v2.setUint32(28,rate*numCh*4,true);
  v2.setUint16(32,numCh*4,true); v2.setUint16(34,32,true);
  ws(36,'data'); v2.setUint32(40,dataSize,true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) {
    const raw = new Float32Array(buf.getChannelData(c));
    channels.push(fadeInSamples > 0 || fadeOutSamples > 0 ? applyFade(raw, fadeInSamples, fadeOutSamples) : raw);
  }

  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < numCh; c++) {
      v2.setFloat32(off, channels[c][i], true); off += 4;
    }
  }
  return ab2;
}

function downloadArrayBuffer(ab: ArrayBuffer, filename: string) {
  const blob = new Blob([ab], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_ICONS: Record<TrackStatus, string> = {
  pending: '‚óã',
  exporting: '‚è≥',
  done: '‚úì',
  skipped: '‚Äî',
  error: '‚úï',
};

const STATUS_COLORS: Record<TrackStatus, string> = {
  pending: 'text-slate-600',
  exporting: 'text-cyan-400',
  done: 'text-emerald-400',
  skipped: 'text-slate-700',
  error: 'text-red-400',
};

export const BatchExportPanel: React.FC<BatchExportPanelProps> = ({ tracks, sessionName = 'Session', onClose }) => {
  const [settings, setSettings] = useState<ExportSettings>({
    bitDepth: 16,
    normalize: false,
    targetLufs: -14,
    fadeIn: 0,
    fadeOut: 0.1,
    prefixNumber: true,
  });
  const [statuses, setStatuses] = useState<Record<string, TrackStatus>>({});
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const tracksWithTakes = tracks.filter(t => t.regions.some(r => r.takes.length > 0));
  const emptyTracks = tracks.filter(t => !t.regions.some(r => r.takes.length > 0));

  const runExport = useCallback(async () => {
    setExporting(true);
    setDone(false);

    const initial: Record<string, TrackStatus> = {};
    tracks.forEach(t => { initial[t.id] = t.regions.some(r => r.takes.length > 0) ? 'pending' : 'skipped'; });
    setStatuses(initial);

    for (let i = 0; i < tracksWithTakes.length; i++) {
      const track = tracksWithTakes[i];
      setStatuses(prev => ({ ...prev, [track.id]: 'exporting' }));

      try {
        const region = track.regions.find(r => r.takes.length > 0)!;
        const take = region.takes[region.activeTaskIdx] ?? region.takes[region.takes.length - 1];
        const ab = await take.blob.arrayBuffer();
        const ctx = new AudioContext();
        let buf = await ctx.decodeAudioData(ab);

        if (settings.normalize) buf = normalizeBuffer(buf, settings.targetLufs);

        const safeName = track.name.replace(/[^a-zA-Z0-9_\- ]/g, '_').replace(/\s+/g, '_');
        const prefix = settings.prefixNumber ? `${String(i + 1).padStart(2, '0')}_` : '';
        const filename = `${prefix}${safeName}.wav`;

        let encoded = settings.bitDepth === 32
          ? encodeWav32(buf, settings.fadeIn, settings.fadeOut)
          : encodeWav16(buf, settings.fadeIn, settings.fadeOut);

        // Compute RMS-LUFS estimate for metadata
        const chData = buf.getChannelData(0);
        let rmsSum = 0;
        for (let s = 0; s < chData.length; s++) rmsSum += chData[s] * chData[s];
        const rms = Math.sqrt(rmsSum / chData.length);
        const measuredLufs = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -70;
        let truePeak = 0;
        for (let s = 0; s < chData.length; s++) if (Math.abs(chData[s]) > truePeak) truePeak = Math.abs(chData[s]);
        const tpDb = truePeak > 0 ? 20 * Math.log10(truePeak) : -100;

        encoded = injectWavMetadata(encoded, {
          title:          track.name,
          year:           new Date().getFullYear().toString(),
          software:       'Echo Sound Lab 2.5',
          integratedLufs: parseFloat(measuredLufs.toFixed(1)),
          truePeakDb:     parseFloat(tpDb.toFixed(1)),
        });

        downloadArrayBuffer(encoded, filename);
        setStatuses(prev => ({ ...prev, [track.id]: 'done' }));

        // Small delay between downloads to avoid browser blocking
        await new Promise(r => setTimeout(r, 300));
      } catch {
        setStatuses(prev => ({ ...prev, [track.id]: 'error' }));
      }
    }

    setExporting(false);
    setDone(true);
  }, [tracks, tracksWithTakes, settings]);

  const doneCount = Object.values(statuses).filter(s => s === 'done').length;
  const errCount = Object.values(statuses).filter(s => s === 'error').length;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-md bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Batch Export</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {tracksWithTakes.length} track{tracksWithTakes.length !== 1 ? 's' : ''} ready ¬{emptyTracks.length} empty
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Settings */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Export settings</p>

            {/* Bit depth */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400">Bit depth</span>
              <div className="flex gap-1.5">
                {([16, 32] as const).map(bd => (
                  <button key={bd} onClick={() => setSettings(s => ({ ...s, bitDepth: bd }))}
                    className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${settings.bitDepth === bd ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06]'}`}>
                    {bd}-bit {bd === 32 ? 'float' : 'PCM'}
                  </button>
                ))}
              </div>
            </div>

            {/* Prefix number */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-400">Number tracks</span>
                <p className="text-[8px] text-slate-700">e.g. 01_Drums.wav, 02_Bass.wav</p>
              </div>
              <button onClick={() => setSettings(s => ({ ...s, prefixNumber: !s.prefixNumber }))}
                className={`w-8 h-4 rounded-full transition-all relative ${settings.prefixNumber ? 'bg-cyan-500/40' : 'bg-white/[0.06]'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${settings.prefixNumber ? 'left-4 bg-cyan-400' : 'left-0.5 bg-slate-600'}`} />
              </button>
            </div>

            {/* Normalize */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-400">Normalize to target LUFS</span>
                  <p className="text-[8px] text-slate-700">Level-match all tracks before export</p>
                </div>
                <button onClick={() => setSettings(s => ({ ...s, normalize: !s.normalize }))}
                  className={`w-8 h-4 rounded-full transition-all relative ${settings.normalize ? 'bg-purple-500/40' : 'bg-white/[0.06]'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${settings.normalize ? 'left-4 bg-purple-400' : 'left-0.5 bg-slate-600'}`} />
                </button>
              </div>
              {settings.normalize && (
                <div className="flex items-center gap-3">
                  <input type="range" min={-24} max={-8} step={0.5} value={settings.targetLufs}
                    onChange={e => setSettings(s => ({ ...s, targetLufs: Number(e.target.value) }))}
                    className="flex-1 accent-purple-400" />
                  <span className="text-[9px] font-mono text-purple-400 w-14 text-right">{settings.targetLufs} LUFS</span>
                </div>
              )}
            </div>

            {/* Fades */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[8px] text-slate-500">Fade in</p>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={2} step={0.05} value={settings.fadeIn}
                    onChange={e => setSettings(s => ({ ...s, fadeIn: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-400" />
                  <span className="text-[8px] font-mono text-emerald-400 w-8">{settings.fadeIn.toFixed(2)}s</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[8px] text-slate-500">Fade out</p>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={2} step={0.05} value={settings.fadeOut}
                    onChange={e => setSettings(s => ({ ...s, fadeOut: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-400" />
                  <span className="text-[8px] font-mono text-emerald-400 w-8">{settings.fadeOut.toFixed(2)}s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Track list */}
          <div className="space-y-1.5">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Tracks</p>
            {tracks.map((track, i) => {
              const hasTake = track.regions.some(r => r.takes.length > 0);
              const status = statuses[track.id] ?? (hasTake ? 'pending' : 'skipped');
              return (
                <div key={track.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.01] px-3 py-2">
                  <span className={`text-[10px] font-mono ${STATUS_COLORS[status]}`}>{STATUS_ICONS[status]}</span>
                  <span className="text-[9px] text-slate-400 flex-1 truncate">
                    {settings.prefixNumber ? `${String(i + 1).padStart(2, '0')} ‚Ä` : ''}{track.name}
                  </span>
                  <span className={`text-[8px] ${hasTake ? 'text-slate-600' : 'text-slate-800'}`}>
                    {hasTake ? 'WAV' : 'empty'}
                  </span>
                  {status === 'exporting' && (
                    <motion.div
                      className="w-2 h-2 rounded-full bg-cyan-400"
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Export button */}
          <button
            onClick={runExport}
            disabled={exporting || tracksWithTakes.length === 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/25 text-[11px] font-bold uppercase tracking-widest text-slate-200 hover:text-white hover:from-cyan-500/30 hover:to-emerald-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? `Exporting‚Ä${doneCount}/${tracksWithTakes.length}` : `‚ÜExport ${tracksWithTakes.length} Track${tracksWithTakes.length !== 1 ? 's' : ''}`}
          </button>

          <AnimatePresence>
            {done && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-4 text-center space-y-1 ${errCount > 0 ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-emerald-500/20 bg-emerald-500/[0.04]'}`}>
                <p className="text-2xl">{errCount > 0 ? '‚ö†' : 'üéâ'}</p>
                <p className="text-[11px] font-bold text-white">{doneCount} track{doneCount !== 1 ? 's' : ''} exported</p>
                {errCount > 0 && <p className="text-[9px] text-amber-400">{errCount} failed ‚Ächeck console</p>}
                <p className="text-[8px] text-slate-500">Check your Downloads folder</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
