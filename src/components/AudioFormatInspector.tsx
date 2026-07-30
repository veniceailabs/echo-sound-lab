/**
 * AudioFormatInspector â€Technical metadata for loaded audio
 *
 * Shows the decoded AudioBuffer properties:
 * - Sample rate, channel count, duration, total samples
 * - Estimated file sizes at various formats
 * - Frequency response capability based on Nyquist
 * - DC offset check
 * - Silence percentage
 *
 * Useful for troubleshooting, pre-export verification, and education.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AudioFormatInspectorProps {
  buffer: AudioBuffer | null;
  fileName?: string;
  onClose: () => void;
}

interface AudioMetadata {
  sampleRate: number;
  channels: number;
  duration: number;
  totalSamples: number;
  nyquist: number;
  dcOffset: { L: number; R: number };
  silencePct: number;
  truePeakDb: number;
  rmsDb: number;
  estimatedSizes: Array<{ format: string; sizeMB: number; quality: string }>;
  crestFactor: number;
}

const SILENCE_THRESHOLD = 0.0001;

function analyze(buffer: AudioBuffer): AudioMetadata {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const n = L.length;

  let sumL = 0, sumR = 0, sumL2 = 0, sumR2 = 0;
  let peakL = 0, peakR = 0;
  let silentSamples = 0;

  for (let i = 0; i < n; i++) {
    sumL += L[i]; sumR += R[i];
    sumL2 += L[i] * L[i]; sumR2 += R[i] * R[i];
    if (Math.abs(L[i]) > peakL) peakL = Math.abs(L[i]);
    if (Math.abs(R[i]) > peakR) peakR = Math.abs(R[i]);
    if (Math.abs(L[i]) < SILENCE_THRESHOLD && Math.abs(R[i]) < SILENCE_THRESHOLD) silentSamples++;
  }

  const rmsL = Math.sqrt(sumL2 / n);
  const rmsR = Math.sqrt(sumR2 / n);
  const rms = Math.sqrt((sumL2 + sumR2) / (n * 2));
  const peak = Math.max(peakL, peakR);

  const toDb = (v: number) => v > 0 ? 20 * Math.log10(v) : -96;

  // Estimated file sizes
  const totalSamples = n;
  const ch = buffer.numberOfChannels;
  const sr = buffer.sampleRate;

  const pcm16MB = (totalSamples * ch * 2) / 1e6;
  const pcm24MB = (totalSamples * ch * 3) / 1e6;
  const pcm32MB = (totalSamples * ch * 4) / 1e6;
  const mp3MB = (buffer.duration * 320 * 1000 / 8) / 1e6; // 320kbps
  const aacMB = (buffer.duration * 256 * 1000 / 8) / 1e6; // 256kbps

  return {
    sampleRate: sr,
    channels: ch,
    duration: buffer.duration,
    totalSamples,
    nyquist: sr / 2,
    dcOffset: { L: sumL / n, R: sumR / n },
    silencePct: (silentSamples / n) * 100,
    truePeakDb: toDb(peak),
    rmsDb: toDb(rms),
    crestFactor: peak > 0 && rms > 0 ? toDb(peak / rms) : 0,
    estimatedSizes: [
      { format: 'WAV 16-bit PCM', sizeMB: pcm16MB, quality: 'CD quality' },
      { format: 'WAV 24-bit PCM', sizeMB: pcm24MB, quality: 'Studio standard' },
      { format: 'WAV 32-bit float', sizeMB: pcm32MB, quality: 'Professional / DAW' },
      { format: 'MP3 320kbps', sizeMB: mp3MB, quality: 'Lossy high quality' },
      { format: 'AAC 256kbps', sizeMB: aacMB, quality: 'Streaming standard' },
    ],
  };
}

function Row({ label, value, sub }: { key?: React.Key; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[9px] text-slate-500">{label}</span>
      <div className="text-right">
        <span className="text-[9px] font-mono text-slate-200">{value}</span>
        {sub && <span className="text-[8px] text-slate-600 ml-2">{sub}</span>}
      </div>
    </div>
  );
}

export const AudioFormatInspector: React.FC<AudioFormatInspectorProps> = ({
  buffer, fileName, onClose,
}) => {
  const [meta, setMeta] = useState<AudioMetadata | null>(null);

  useEffect(() => {
    if (!buffer) return;
    setMeta(analyze(buffer));
  }, [buffer]);

  const mins = meta ? Math.floor(meta.duration / 60) : 0;
  const secs = meta ? (meta.duration % 60).toFixed(1) : '0';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-md bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Audio Inspector</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {fileName ?? 'Loaded audio'} Âtechnical metadata
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {meta && (
            <>
              {/* Core properties */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-0">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Format</p>
                <Row label="Sample rate" value={`${meta.sampleRate.toLocaleString()} Hz`} sub={meta.sampleRate === 44100 ? 'CD' : meta.sampleRate === 48000 ? 'Video standard' : 'High-res'} />
                <Row label="Channels" value={meta.channels === 1 ? 'Mono (1)' : meta.channels === 2 ? 'Stereo (2)' : `${meta.channels}ch`} />
                <Row label="Duration" value={`${mins}:${String(Math.floor(Number(secs))).padStart(2, '0')}.${(Number(secs) % 1).toFixed(0)}`} />
                <Row label="Total samples" value={meta.totalSamples.toLocaleString()} />
                <Row label="Nyquist limit" value={`${(meta.nyquist / 1000).toFixed(1)} kHz`} sub="max reproducible freq" />
              </div>

              {/* Levels */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-0">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Signal levels</p>
                <Row label="True peak" value={`${meta.truePeakDb.toFixed(1)} dBFS`} />
                <Row label="RMS level" value={`${meta.rmsDb.toFixed(1)} dBFS`} />
                <Row label="Crest factor" value={`${meta.crestFactor.toFixed(1)} dB`} sub="peak - RMS = dynamic headroom" />
                <Row
                  label="DC offset (L)"
                  value={meta.dcOffset.L.toFixed(5)}
                  sub={Math.abs(meta.dcOffset.L) > 0.001 ? 'âšHigh DC â€apply DC filter' : 'OK'}
                />
                {meta.channels > 1 && (
                  <Row
                    label="DC offset (R)"
                    value={meta.dcOffset.R.toFixed(5)}
                    sub={Math.abs(meta.dcOffset.R) > 0.001 ? 'âšHigh DC' : 'OK'}
                  />
                )}
                <Row
                  label="Silence"
                  value={`${meta.silencePct.toFixed(1)}%`}
                  sub={meta.silencePct > 20 ? 'Large silent sections present' : 'Normal'}
                />
              </div>

              {/* File size estimates */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-0">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Estimated export sizes</p>
                {meta.estimatedSizes.map(s => (
                  <Row
                    key={s.format}
                    label={s.format}
                    value={s.sizeMB < 1 ? `${(s.sizeMB * 1000).toFixed(0)} KB` : `${s.sizeMB.toFixed(1)} MB`}
                    sub={s.quality}
                  />
                ))}
              </div>

              {/* Warnings */}
              <div className="space-y-1.5">
                {meta.truePeakDb > -0.3 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
                    <p className="text-[9px] text-red-300">âšTrue peak is {meta.truePeakDb.toFixed(1)} dBFS â€dangerously close to 0. Apply gain reduction before mastering.</p>
                  </div>
                )}
                {Math.abs(meta.dcOffset.L) > 0.001 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                    <p className="text-[9px] text-amber-300">âšDC offset detected. Apply a DC filter (high-pass at 10 Hz) to remove it before mastering.</p>
                  </div>
                )}
                {meta.crestFactor < 6 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                    <p className="text-[9px] text-amber-300">âšLow crest factor ({meta.crestFactor.toFixed(1)} dB) â€mix is heavily compressed. Dynamic range may be too restricted for mastering.</p>
                  </div>
                )}
                {meta.truePeakDb <= -6 && meta.crestFactor >= 8 && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                    <p className="text-[9px] text-emerald-300">âœAudio looks healthy â€good headroom and dynamic range for mastering.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
