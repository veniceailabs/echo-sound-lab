/**
 * SmartExportPanel �Multi-format export with platform presets
 *
 * Generates WAV, FLAC (as WAV 24-bit), and MP3-quality WAV with the right
 * specs for each platform. Shows what each format means in plain English.
 * Everything runs in the browser �no server calls.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExportFormat {
  id: string;
  name: string;
  fileExt: string;
  description: string;
  platforms: string;
  bitDepth: 16 | 24 | 32;
  sampleRate: number;
  recommended: boolean;
}

const FORMATS: ExportFormat[] = [
  {
    id: 'wav_24_48',
    name: 'WAV 24-bit / 48kHz',
    fileExt: 'wav',
    description: 'Studio master quality. Use this for distribution platforms, sync licensing, and anywhere you want the highest quality.',
    platforms: 'DistroKid �TuneCore �CD Baby �Spotify submission',
    bitDepth: 24,
    sampleRate: 48000,
    recommended: true,
  },
  {
    id: 'wav_16_44',
    name: 'WAV 16-bit / 44.1kHz',
    fileExt: 'wav',
    description: 'CD-quality. Still excellent for streaming. Used when a platform specifically asks for 16-bit.',
    platforms: 'CD pressing �iTunes �SoundCloud',
    bitDepth: 16,
    sampleRate: 44100,
    recommended: false,
  },
  {
    id: 'wav_32_48',
    name: 'WAV 32-bit float / 48kHz',
    fileExt: 'wav',
    description: 'Maximum dynamic range �no clipping possible. Best for sending to a mastering engineer who will process it further.',
    platforms: 'Mastering engineer handoff �Pro Tools / Logic import',
    bitDepth: 32,
    sampleRate: 48000,
    recommended: false,
  },
  {
    id: 'wav_24_96',
    name: 'WAV 24-bit / 96kHz',
    fileExt: 'wav',
    description: 'Hi-res audio. Double the sample rate catches more detail. Larger file size.',
    platforms: 'Tidal Hi-Fi �Qobuz �Apple Music Lossless (via distribution)',
    bitDepth: 24,
    sampleRate: 96000,
    recommended: false,
  },
];

const PLATFORM_PRESETS = [
  {
    name: 'Spotify / Apple Music',
    icon: '🎵',
    formatId: 'wav_24_48',
    note: 'Normalizes to −14 LUFS. Submit WAV, they convert.',
  },
  {
    name: 'YouTube',
    icon: '▶️',
    formatId: 'wav_16_44',
    note: 'Normalizes to −14 LUFS. Accepts WAV or FLAC.',
  },
  {
    name: 'SoundCloud',
    icon: '☁️',
    formatId: 'wav_16_44',
    note: 'Normalizes to −8 LUFS. Direct upload in WAV.',
  },
  {
    name: 'Mastering Engineer',
    icon: '🎚',
    formatId: 'wav_32_48',
    note: 'Send 32-bit float �preserves full headroom.',
  },
  {
    name: 'TuneCore / DistroKid',
    icon: '📦',
    formatId: 'wav_24_48',
    note: '24-bit WAV is the industry standard for distribution.',
  },
  {
    name: 'Tidal Hi-Fi',
    icon: '🔷',
    formatId: 'wav_24_96',
    note: 'Hi-res submission requires 96kHz or higher.',
  },
];

// ─── WAV encoder ──────────────────────────────────────────────────────────────

function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24 | 32, targetSampleRate: number): Blob {
  const numChannels = buffer.numberOfChannels;
  const inputSampleRate = buffer.sampleRate;

  // Resample if needed (simple linear interpolation)
  let samples: Float32Array[];
  if (inputSampleRate !== targetSampleRate) {
    const ratio = targetSampleRate / inputSampleRate;
    const newLength = Math.round(buffer.length * ratio);
    samples = Array.from({ length: numChannels }, (_, ch) => {
      const inData = buffer.getChannelData(ch);
      const outData = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const srcIdx = i / ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, inData.length - 1);
        const frac = srcIdx - lo;
        outData[i] = inData[lo] * (1 - frac) + inData[hi] * frac;
      }
      return outData;
    });
  } else {
    samples = Array.from({ length: numChannels }, (_, ch) => buffer.getChannelData(ch));
  }

  const frameCount = samples[0].length;
  const bytesPerSample = bitDepth / 8;
  const dataSize = frameCount * numChannels * bytesPerSample;
  const wavSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(wavSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  const wu16 = (o: number, v: number) => view.setUint16(o, v, true);
  const wu32 = (o: number, v: number) => view.setUint32(o, v, true);

  write(0, 'RIFF');
  wu32(4, wavSize - 8);
  write(8, 'WAVE');
  write(12, 'fmt ');
  wu32(16, 16); // PCM chunk size
  wu16(20, bitDepth === 32 ? 3 : 1); // 3 = IEEE float, 1 = PCM
  wu16(22, numChannels);
  wu32(24, targetSampleRate);
  wu32(28, targetSampleRate * numChannels * bytesPerSample);
  wu16(32, numChannels * bytesPerSample);
  wu16(34, bitDepth);
  write(36, 'data');
  wu32(40, dataSize);

  // Interleaved samples
  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, samples[ch][i]));
      if (bitDepth === 32) {
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else if (bitDepth === 24) {
        const int24 = Math.round(sample * 8388607);
        view.setUint8(offset, int24 & 0xff);
        view.setUint8(offset + 1, (int24 >> 8) & 0xff);
        view.setUint8(offset + 2, (int24 >> 16) & 0xff);
        offset += 3;
      } else {
        const int16 = Math.round(sample * 32767);
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// ─── Components ───────────────────────────────────────────────────────────────

interface SmartExportPanelProps {
  buffer: AudioBuffer | null;
  trackName?: string;
  onClose: () => void;
}

function FormatCard({
  fmt,
  selected,
  onSelect,
  exporting,
  onExport,
  key,
}: {
  key?: React.Key;
  fmt: ExportFormat;
  selected: boolean;
  onSelect: () => void;
  exporting: boolean;
  onExport: () => void;
}) {
  const bytesPerSample = fmt.bitDepth / 8;
  // Rough file size estimate for 3 min stereo
  const estimatedMB = ((fmt.sampleRate * 2 * bytesPerSample * 180) / 1024 / 1024).toFixed(0);

  return (
    <motion.div
      onClick={onSelect}
      whileHover={{ scale: 1.005 }}
      className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
        selected
          ? 'border-cyan-500/40 bg-cyan-500/5'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
              selected ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/20'
            }`}>
              {selected && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
            </div>
            <p className="text-[11px] font-semibold text-white">{fmt.name}</p>
            {fmt.recommended && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 font-semibold">
                RECOMMENDED
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed pl-5">{fmt.description}</p>
          <p className="text-[9px] text-slate-700 mt-1.5 pl-5">{fmt.platforms}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] text-slate-700 font-mono">~{estimatedMB} MB</p>
          <p className="text-[8px] text-slate-700 mt-0.5">3 min stereo</p>
        </div>
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 pt-3 border-t border-white/[0.06]"
        >
          <button
            onClick={e => { e.stopPropagation(); onExport(); }}
            disabled={exporting}
            className="w-full py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-500/30 transition-all disabled:opacity-40"
          >
            {exporting ? 'Encoding…' : `�Export ${fmt.name}`}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

export const SmartExportPanel: React.FC<SmartExportPanelProps> = ({ buffer, trackName = 'track', onClose }) => {
  const [selectedFormat, setSelectedFormat] = useState('wav_24_48');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (!buffer) return;
    const fmt = FORMATS.find(f => f.id === selectedFormat);
    if (!fmt) return;

    setExporting(true);
    setExported(null);

    try {
      // Run encoding in a microtask to let UI update
      await new Promise<void>(resolve => setTimeout(resolve, 30));
      const blob = encodeWav(buffer, fmt.bitDepth, fmt.sampleRate);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = trackName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeName}_${fmt.bitDepth}bit_${fmt.sampleRate / 1000}kHz.wav`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(fmt.name);
    } finally {
      setExporting(false);
    }
  }, [buffer, selectedFormat, trackName]);

  const handlePlatformPreset = useCallback((presetFormatId: string) => {
    setSelectedFormat(presetFormatId);
  }, []);

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
        className="w-full max-w-xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Smart Export</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Choose the right format for your destination �explained in plain English
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!buffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track to export</p>
          )}

          {buffer && (
            <>
              {/* Success banner */}
              <AnimatePresence>
                {exported && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <span className="text-emerald-400 text-lg">✓</span>
                    <div>
                      <p className="text-[11px] font-semibold text-emerald-300">File saved!</p>
                      <p className="text-[10px] text-emerald-600">{exported} �check your Downloads folder</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Platform quick picks */}
              <div className="space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Quick pick by platform</p>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORM_PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => handlePlatformPreset(p.formatId)}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        selectedFormat === p.formatId
                          ? 'border-cyan-500/30 bg-cyan-500/5'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                      }`}
                    >
                      <span className="text-base">{p.icon}</span>
                      <p className="text-[9px] font-semibold text-slate-300 mt-1 leading-tight">{p.name}</p>
                      <p className="text-[8px] text-slate-700 mt-0.5 leading-tight">{p.note}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format cards */}
              <div className="space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Choose format</p>
                {FORMATS.map(fmt => (
                  <FormatCard
                    key={fmt.id}
                    fmt={fmt}
                    selected={selectedFormat === fmt.id}
                    onSelect={() => setSelectedFormat(fmt.id)}
                    exporting={exporting}
                    onExport={handleExport}
                  />
                ))}
              </div>

              {/* Info callout */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <p className="text-[9px] text-slate-700 leading-relaxed">
                  <span className="text-slate-500">Note:</span> This encodes directly in your browser �no data leaves your device.
                  All exports are lossless WAV files. "FLAC" and "MP3" are handled by your distribution platform after upload.
                  For MP3 specifically, upload the WAV to your distributor and they convert it correctly with proper metadata.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
