/**
 * PitchTimePanel ‚ÄPitch shift and time stretch controls
 *
 * Uses the WebAudio API's AudioBuffer manipulation:
 * - Pitch shift: resamples buffer at a different playback rate
 * - Time stretch: stretches/compresses via phase-vocoder-like
 *   overlap-add (OLA) technique using OfflineAudioContext
 *
 * Outputs a new AudioBuffer for download or re-rendering.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PitchTimePanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const SEMITONE_PRESETS = [
  { label: '-12', value: -12 },
  { label: '-7', value: -7 },
  { label: '-5', value: -5 },
  { label: '-3', value: -3 },
  { label: '-2', value: -2 },
  { label: '-1', value: -1 },
  { label: '0', value: 0 },
  { label: '+1', value: 1 },
  { label: '+2', value: 2 },
  { label: '+3', value: 3 },
  { label: '+5', value: 5 },
  { label: '+7', value: 7 },
  { label: '+12', value: 12 },
];

const STRETCH_PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '80%', value: 0.8 },
  { label: '90%', value: 0.9 },
  { label: '100%', value: 1.0 },
  { label: '110%', value: 1.1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2.0 },
];

/**
 * Simple pitch shift via resampling.
 * Creates a new AudioBuffer at a resampled rate ‚Ätrue pitch shift.
 */
async function pitchShift(buffer: AudioBuffer, semitones: number): Promise<AudioBuffer> {
  if (semitones === 0) return buffer;

  const ratio = Math.pow(2, semitones / 12);
  const newRate = buffer.sampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const offCtx = new OfflineAudioContext(buffer.numberOfChannels, newLength, newRate);

  const src = offCtx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = ratio;
  src.connect(offCtx.destination);
  src.start(0);

  return offCtx.startRendering();
}

/**
 * Simple time stretch via OLA (overlap-add).
 * Keeps pitch constant, changes duration.
 */
function timeStretch(buffer: AudioBuffer, factor: number): AudioBuffer {
  if (factor === 1.0) return buffer;

  const numCh = buffer.numberOfChannels;
  const inLen = buffer.length;
  const outLen = Math.round(inLen * factor);
  const hopSize = 512;
  const windowSize = 2048;

  const outCtx = new AudioContext();
  const outBuf = outCtx.createBuffer(numCh, outLen, buffer.sampleRate);

  for (let ch = 0; ch < numCh; ch++) {
    const inData = buffer.getChannelData(ch);
    const outData = outBuf.getChannelData(ch);
    const overlap = new Float32Array(windowSize);

    let inPos = 0;
    let outPos = 0;

    while (outPos + windowSize <= outLen) {
      // Hann window
      for (let i = 0; i < windowSize; i++) {
        const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
        const inIdx = Math.round(inPos) + i;
        const sample = inIdx < inLen ? inData[inIdx] : 0;
        outData[outPos + i] = (outData[outPos + i] || 0) + sample * w;
      }
      inPos += hopSize / factor;
      outPos += hopSize;
    }
  }

  return outBuf;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

function downloadBuffer(buf: AudioBuffer, name: string) {
  // Encode as WAV
  const numCh = buf.numberOfChannels;
  const len = buf.length;
  const rate = buf.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = rate * blockAlign;
  const dataSize = len * blockAlign;
  const bufferSize = 44 + dataSize;

  const ab = new ArrayBuffer(bufferSize);
  const view = new DataView(ab);

  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, rate, true);
  view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: numCh }, (_, c) => buf.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  const blob = new Blob([ab], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const PitchTimePanel: React.FC<PitchTimePanelProps> = ({ buffer, onClose }) => {
  const [semitones, setSemitones] = useState(0);
  const [stretchFactor, setStretchFactor] = useState(1.0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const originalDuration = buffer?.duration ?? 0;
  const newDuration = originalDuration * stretchFactor;
  const pitchHz = buffer ? (440 * Math.pow(2, semitones / 12)) : 440;

  const process = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    setError(null);
    setResult(null);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    try {
      // Apply time stretch first, then pitch shift
      const stretched = stretchFactor !== 1.0 ? timeStretch(buffer, stretchFactor) : buffer;
      const shifted = semitones !== 0 ? await pitchShift(stretched, semitones) : stretched;
      setResult(shifted);

      // Create preview URL
      const numCh = shifted.numberOfChannels;
      const len = shifted.length;
      const rate = shifted.sampleRate;
      const ab = new ArrayBuffer(44 + len * numCh * 2);
      const view = new DataView(ab);
      const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      ws(0,'RIFF'); view.setUint32(4,36+len*numCh*2,true); ws(8,'WAVE'); ws(12,'fmt ');
      view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,numCh,true);
      view.setUint32(24,rate,true); view.setUint32(28,rate*numCh*2,true);
      view.setUint16(32,numCh*2,true); view.setUint16(34,16,true);
      ws(36,'data'); view.setUint32(40,len*numCh*2,true);
      const chs = Array.from({length:numCh},(_,c)=>shifted.getChannelData(c));
      let off = 44;
      for(let i=0;i<len;i++) for(let c=0;c<numCh;c++){
        const s = Math.max(-1,Math.min(1,chs[c][i]));
        view.setInt16(off, s<0?s*0x8000:s*0x7FFF, true); off+=2;
      }
      const blob = new Blob([ab],{type:'audio/wav'});
      setResultUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(String(e));
    } finally {
      setProcessing(false);
    }
  }, [buffer, semitones, stretchFactor, resultUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }, [playing]);

  useEffect(() => {
    return () => { if (resultUrl) URL.revokeObjectURL(resultUrl); };
  }, [resultUrl]);

  const semitoneLabel = semitones === 0 ? 'No pitch change' : semitones > 0 ? `+${semitones} semitones up` : `${semitones} semitones down`;
  const stretchLabel = stretchFactor === 1 ? 'No time change' : stretchFactor > 1 ? `${((stretchFactor-1)*100).toFixed(0)}% slower` : `${((1-stretchFactor)*100).toFixed(0)}% faster`;

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
            <h2 className="text-sm font-bold text-white">Pitch & Time</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Shift pitch or stretch time ‚Äexport as WAV</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Original info */}
              <div className="flex items-center justify-between text-[9px] text-slate-600 font-mono">
                <span>Original: {formatTime(originalDuration)} ¬{buffer.sampleRate.toLocaleString()} Hz ¬{buffer.numberOfChannels}ch</span>
                <span>‚ÜNew: {formatTime(newDuration)}</span>
              </div>

              {/* Pitch section */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Pitch shift</p>
                  <span className="text-[9px] font-mono text-cyan-400">{semitoneLabel}</span>
                </div>

                {/* Semitone presets */}
                <div className="flex flex-wrap gap-1">
                  {SEMITONE_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setSemitones(p.value)}
                      className={`text-[8px] px-2 py-1 rounded-lg border transition-all font-mono ${
                        semitones === p.value
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Fine slider */}
                <div className="space-y-1">
                  <input
                    type="range" min={-24} max={24} step={1} value={semitones}
                    onChange={e => setSemitones(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-700 font-mono">
                    <span>-24</span><span>0</span><span>+24</span>
                  </div>
                </div>

                {semitones !== 0 && (
                  <p className="text-[8px] text-slate-600">
                    A4 reference: {pitchHz.toFixed(1)} Hz {semitones > 0 ? '‚Üë' : '‚Üì'}
                  </p>
                )}
              </div>

              {/* Time stretch section */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Time stretch</p>
                  <span className="text-[9px] font-mono text-purple-400">{stretchLabel}</span>
                </div>

                {/* Stretch presets */}
                <div className="flex flex-wrap gap-1">
                  {STRETCH_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setStretchFactor(p.value)}
                      className={`text-[8px] px-2 py-1 rounded-lg border transition-all ${
                        stretchFactor === p.value
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <input
                    type="range" min={0.25} max={3.0} step={0.01} value={stretchFactor}
                    onChange={e => setStretchFactor(Number(e.target.value))}
                    className="w-full accent-purple-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-700">
                    <span>25%</span><span>100%</span><span>300%</span>
                  </div>
                </div>
              </div>

              {/* Process button */}
              <button
                onClick={process}
                disabled={processing || (semitones === 0 && stretchFactor === 1.0)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white hover:from-cyan-500/30 hover:to-purple-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {processing ? '‚èProcessing‚Ä¶' : '‚ñApply & Preview'}
              </button>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
                  <p className="text-[9px] text-red-300">{error}</p>
                </div>
              )}

              {/* Result */}
              <AnimatePresence>
                {result && resultUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3"
                  >
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">‚úProcessed ‚Ä{formatTime(result.duration)}</p>
                    <audio
                      ref={audioRef}
                      src={resultUrl}
                      onEnded={() => setPlaying(false)}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all"
                      >
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button
                        onClick={() => downloadBuffer(result, `pitch_time_${semitones}st_${Math.round(stretchFactor*100)}pct.wav`)}
                        className="flex-1 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all"
                      >
                        ‚ÜExport WAV
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Info */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 space-y-1">
                <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">How it works</p>
                <p className="text-[8px] text-slate-700 leading-relaxed">Pitch shift uses WebAudio resampling ‚Äfast and phase-coherent. Time stretch uses OLA (overlap-add) windowing ‚Äbest results with sustained material. For vocals, keep stretch within 80‚Äì125% for natural results.</p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
