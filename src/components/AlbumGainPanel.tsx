/**
 * AlbumGainPanel â€ReplayGain 2.0 Album Normalization
 *
 * Analyzes all loaded tracks together, computes per-track gain
 * recommendations plus a shared album gain so sequential listening
 * preserves the intended dynamics between tracks.
 *
 * Reads every track's first blob, decodes to AudioBuffer in-browser,
 * runs the full BS.1770-4 K-weighted gated LUFS measurement, and
 * presents results in a professional delivery table.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  analyzeAlbumGain,
  generateReplayGainReport,
  AlbumGainResult,
} from '../services/albumGainNormalizer';
import { downloadText } from '../services/cueSheetExporter';

interface TrackInput {
  title: string;
  blob: Blob;
}

interface Props {
  tracks: TrackInput[];
  albumTitle?: string;
  onClose: () => void;
}

export const AlbumGainPanel: React.FC<Props> = ({ tracks, albumTitle = 'Untitled Album', onClose }) => {
  const [status, setStatus] = useState<'idle' | 'decoding' | 'analyzing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0); // 0-1
  const [result, setResult] = useState<AlbumGainResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [targetLufs, setTargetLufs] = useState(-14);

  const run = useCallback(async () => {
    if (tracks.length === 0) return;
    setStatus('decoding');
    setProgress(0);
    setResult(null);
    setErrorMsg('');

    try {
      const decoded: Array<{ title: string; buffer: AudioBuffer }> = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const ab = await t.blob.arrayBuffer();
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(ab);
        ctx.close();
        decoded.push({ title: t.title, buffer: buf });
        setProgress((i + 1) / tracks.length * 0.6);
      }

      setStatus('analyzing');
      // Yield to let React paint "Analyzingâ€¦" before the synchronous DSP work
      await new Promise(r => setTimeout(r, 16));

      const res = analyzeAlbumGain(decoded, targetLufs);
      setProgress(1);
      setResult(res);
      setStatus('done');
    } catch (e) {
      setErrorMsg(String(e));
      setStatus('error');
    }
  }, [tracks, targetLufs]);

  // Auto-run when opened if tracks are available
  useEffect(() => {
    if (tracks.length > 0) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportReport = useCallback(() => {
    if (!result) return;
    downloadText(generateReplayGainReport(result, albumTitle), `${albumTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}_replaygain.txt`);
  }, [result, albumTitle]);

  const exportJson = useCallback(() => {
    if (!result) return;
    downloadText(JSON.stringify(result, null, 2), `${albumTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}_replaygain.json`, 'application/json');
  }, [result, albumTitle]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-2xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Album Gain â€ReplayGain 2.0</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              BS.1770-4 K-weighted gated LUFS Â{tracks.length} track{tracks.length !== 1 ? 's' : ''} Âtarget {targetLufs} LUFS
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {result && (
              <>
                <button onClick={exportReport} className="text-[9px] text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500/10 transition-all">â†TXT Report</button>
                <button onClick={exportJson}   className="text-[9px] text-purple-400 border border-purple-500/30 px-2 py-1 rounded-lg hover:bg-purple-500/10 transition-all">â†JSON</button>
              </>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {tracks.length === 0 && (
            <p className="text-amber-400 text-sm text-center py-8">No tracks loaded. Record or import audio first.</p>
          )}

          {tracks.length > 0 && (
            <>
              {/* Target LUFS + re-analyze */}
              <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest whitespace-nowrap">Target LUFS</span>
                <input
                  type="range" min={-23} max={-9} step={1} value={targetLufs}
                  onChange={e => setTargetLufs(Number(e.target.value))}
                  className="flex-1 accent-cyan-400 h-1"
                />
                <span className="text-[9px] font-mono text-cyan-300 w-10 text-right">{targetLufs} LUFS</span>
                <button onClick={run} disabled={status === 'decoding' || status === 'analyzing'}
                  className="text-[9px] px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all disabled:opacity-40">
                  {status === 'decoding' ? 'Decodingâ€¦' : status === 'analyzing' ? 'Analyzingâ€¦' : 'Analyze'}
                </button>
              </div>

              {/* Progress bar */}
              <AnimatePresence>
                {(status === 'decoding' || status === 'analyzing') && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="space-y-1.5">
                    <p className="text-[9px] text-slate-500 text-center">
                      {status === 'decoding' ? `Decoding audioâ€¦` : 'Running BS.1770-4 loudness analysisâ€¦'}
                    </p>
                    <div className="h-0.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div className="h-full bg-cyan-400 rounded-full"
                        animate={{ width: `${progress * 100}%` }}
                        transition={{ ease: 'linear', duration: 0.1 }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              {status === 'error' && (
                <p className="text-red-400 text-xs text-center py-4">{errorMsg}</p>
              )}

              {/* Results */}
              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Album summary cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest mb-1">Album Loudness</p>
                        <p className="text-xl font-bold text-white font-mono">{result.albumLufs.toFixed(1)}</p>
                        <p className="text-[7px] text-slate-700">LUFS (integrated)</p>
                      </div>
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-center">
                        <p className="text-[7px] text-cyan-600 uppercase tracking-widest mb-1">Album Gain</p>
                        <p className="text-xl font-bold text-cyan-300 font-mono">
                          {result.albumGainDb >= 0 ? '+' : ''}{result.albumGainDb.toFixed(2)}
                        </p>
                        <p className="text-[7px] text-cyan-700">dB to apply</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest mb-1">ReplayGain Tag</p>
                        <p className="text-sm font-bold text-emerald-400 font-mono">{result.replayGainTag}</p>
                        <p className="text-[7px] text-slate-700">TXXX embed value</p>
                      </div>
                    </div>

                    {/* Track table */}
                    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                      <div className="grid text-[7px] text-slate-600 uppercase tracking-widest px-3 py-2 border-b border-white/[0.04] bg-white/[0.02]"
                        style={{ gridTemplateColumns: '2rem 1fr 4.5rem 4.5rem 4.5rem 3.5rem 3rem' }}>
                        <span>#</span>
                        <span>Title</span>
                        <span className="text-right">LUFS</span>
                        <span className="text-right">Track Gain</span>
                        <span className="text-right">Album Gain</span>
                        <span className="text-right">Peak</span>
                        <span className="text-center">Clips?</span>
                      </div>
                      {result.tracks.map(t => (
                        <div key={t.trackIndex}
                          className={`grid px-3 py-2.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors ${t.clipsAfterGain ? 'bg-red-500/[0.04]' : ''}`}
                          style={{ gridTemplateColumns: '2rem 1fr 4.5rem 4.5rem 4.5rem 3.5rem 3rem' }}>
                          <span className="text-[9px] text-slate-600 font-mono">{t.trackIndex + 1}</span>
                          <span className="text-[9px] text-slate-300 truncate pr-2">{t.trackTitle}</span>
                          <span className="text-[9px] font-mono text-slate-400 text-right">{t.measuredLufs.toFixed(1)}</span>
                          <span className={`text-[9px] font-mono text-right ${t.trackGainDb >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {t.trackGainDb >= 0 ? '+' : ''}{t.trackGainDb.toFixed(2)} dB
                          </span>
                          <span className={`text-[9px] font-mono text-right ${t.albumGainDb >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                            {t.albumGainDb >= 0 ? '+' : ''}{t.albumGainDb.toFixed(2)} dB
                          </span>
                          <span className="text-[9px] font-mono text-slate-500 text-right">{t.peakDb.toFixed(1)} dBFS</span>
                          <span className="text-[8px] text-center">
                            {t.clipsAfterGain ? <span className="text-red-400 font-bold">âšCLIP</span> : <span className="text-emerald-700">OK</span>}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Legend */}
                    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 space-y-1">
                      <p className="text-[8px] text-slate-600 leading-relaxed">
                        <span className="text-emerald-500 font-semibold">Track Gain</span> â€apply per-track for shuffle / single play. Each track hits {targetLufs} LUFS independently.
                      </p>
                      <p className="text-[8px] text-slate-600 leading-relaxed">
                        <span className="text-cyan-500 font-semibold">Album Gain</span> â€apply for sequential album play. Preserves relative dynamics between tracks; quieter tracks stay quieter.
                      </p>
                      <p className="text-[8px] text-slate-600 leading-relaxed">
                        Embed both as <span className="text-slate-400 font-mono">TXXX:REPLAYGAIN_TRACK_GAIN</span> and <span className="text-slate-400 font-mono">TXXX:REPLAYGAIN_ALBUM_GAIN</span> ID3v2.3 frames.
                      </p>
                    </div>
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
