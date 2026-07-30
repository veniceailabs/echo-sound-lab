/**
 * VocalPitchAnalyzer ‚ÄDetect dominant pitch / note in audio
 *
 * Uses autocorrelation (YIN-inspired) to estimate the fundamental
 * frequency in short frames across the file:
 * - Frame size: 2048 samples with 50% hop
 * - For each frame: compute autocorrelation, find first minimum
 *   (difference function), refine via parabolic interpolation
 * - Map frequency to nearest musical note (A4 = 440 Hz)
 *
 * Output:
 * - Note histogram: which notes appear most
 * - Dominant note + detected key center
 * - Pitch track graph showing freq over time (canvas)
 * - Confidence score per frame
 * - Export pitch data as CSV
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VocalPitchAnalyzerProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToNote(freq: number): { note: string; octave: number; cents: number; midi: number } {
  if (freq <= 0) return { note: '‚Äî', octave: 0, cents: 0, midi: 0 };
  const midi = 12 * Math.log2(freq / 440) + 69;
  const midiRound = Math.round(midi);
  const cents = Math.round((midi - midiRound) * 100);
  const noteIdx = ((midiRound % 12) + 12) % 12;
  const octave = Math.floor(midiRound / 12) - 1;
  return { note: NOTE_NAMES[noteIdx], octave, cents, midi: midiRound };
}

function autocorrelationPitch(frame: Float32Array, sr: number): { freq: number; confidence: number } {
  const n = frame.length;
  const minPeriod = Math.floor(sr / 1000); // max 1000 Hz
  const maxPeriod = Math.floor(sr / 50);   // min 50 Hz

  // Difference function
  const df = new Float32Array(maxPeriod);
  for (let tau = 0; tau < maxPeriod; tau++) {
    let sum = 0;
    for (let i = 0; i < n - maxPeriod; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    df[tau] = sum;
  }

  // Cumulative mean normalized difference function (CMND)
  const cmnd = new Float32Array(maxPeriod);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < maxPeriod; tau++) {
    runningSum += df[tau];
    cmnd[tau] = df[tau] * tau / (runningSum || 1);
  }

  // Find first dip below 0.1 (confidence threshold)
  let tau = minPeriod;
  const threshold = 0.15;
  while (tau < maxPeriod) {
    if (cmnd[tau] < threshold) {
      // Find local minimum
      while (tau + 1 < maxPeriod && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
    tau++;
  }

  if (tau >= maxPeriod) return { freq: 0, confidence: 0 };

  // Parabolic interpolation for sub-sample accuracy
  const prev = tau > 0 ? cmnd[tau - 1] : cmnd[tau];
  const next = tau < maxPeriod - 1 ? cmnd[tau + 1] : cmnd[tau];
  const refinement = next !== prev ? 0.5 * (prev - next) / (prev - 2 * cmnd[tau] + next) : 0;
  const refinedTau = tau + refinement;

  const freq = sr / refinedTau;
  const confidence = 1 - cmnd[tau];
  return { freq, confidence: Math.max(0, Math.min(1, confidence)) };
}

interface PitchFrame {
  time: number;
  freq: number;
  note: string;
  octave: number;
  cents: number;
  confidence: number;
}

function analyzePitch(buffer: AudioBuffer, frameSize = 2048, hopSize = 1024): PitchFrame[] {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const frames: PitchFrame[] = [];

  for (let start = 0; start + frameSize <= data.length; start += hopSize) {
    const frame = data.slice(start, start + frameSize);
    // RMS gate ‚Äskip silent frames
    let rms = 0;
    for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / frame.length);
    if (rms < 0.01) continue;

    const { freq, confidence } = autocorrelationPitch(frame, sr);
    if (confidence > 0.3 && freq > 50 && freq < 1000) {
      const { note, octave, cents } = freqToNote(freq);
      frames.push({ time: start / sr, freq, note, octave, cents, confidence });
    }
  }
  return frames;
}

function drawPitchTrack(canvas: HTMLCanvasElement, frames: PitchFrame[], duration: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width; const H = canvas.height;
  ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);

  if (frames.length === 0) return;

  const minFreq = 50; const maxFreq = 1000;
  const logMin = Math.log2(minFreq); const logMax = Math.log2(maxFreq);

  // Note grid lines
  for (let midi = 36; midi <= 84; midi++) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const logF = Math.log2(freq);
    const y = H - ((logF - logMin) / (logMax - logMin)) * H;
    const noteName = NOTE_NAMES[((midi % 12) + 12) % 12];
    const isC = noteName === 'C';
    ctx.strokeStyle = isC ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.lineWidth = isC ? 1 : 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    if (isC) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '6px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${noteName}${Math.floor(midi / 12) - 1}`, 2, y - 2);
    }
  }

  // Pitch points
  for (const f of frames) {
    if (f.freq <= 0) continue;
    const x = (f.time / duration) * W;
    const logF = Math.log2(Math.max(minFreq, Math.min(maxFreq, f.freq)));
    const y = H - ((logF - logMin) / (logMax - logMin)) * H;

    const hue = (f.freq / maxFreq) * 200 + 160; // cyan to purple
    ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${f.confidence * 0.8 + 0.1})`;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  }
}

export const VocalPitchAnalyzer: React.FC<VocalPitchAnalyzerProps> = ({ buffer, onClose }) => {
  const [frames, setFrames] = useState<PitchFrame[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analyze = useCallback(async () => {
    if (!buffer) return;
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 10));
    const result = analyzePitch(buffer);
    setFrames(result);
    if (canvasRef.current) drawPitchTrack(canvasRef.current, result, buffer.duration);
    setAnalyzing(false);
  }, [buffer]);

  // Note histogram
  const noteCount: Record<string, number> = {};
  for (const f of frames) {
    noteCount[f.note] = (noteCount[f.note] || 0) + f.confidence;
  }
  const sortedNotes = Object.entries(noteCount).sort((a, b) => b[1] - a[1]);
  const topNote = sortedNotes[0]?.[0] ?? '‚Äî';
  const maxCount = sortedNotes[0]?.[1] ?? 1;

  const avgFreq = frames.length > 0 ? frames.reduce((s, f) => s + f.freq, 0) / frames.length : 0;
  const avgConfidence = frames.length > 0 ? frames.reduce((s, f) => s + f.confidence, 0) / frames.length : 0;

  const exportCsv = useCallback(() => {
    const header = 'time_sec,freq_hz,note,octave,cents,confidence\n';
    const rows = frames.map(f => `${f.time.toFixed(3)},${f.freq.toFixed(2)},${f.note},${f.octave},${f.cents},${f.confidence.toFixed(3)}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pitch_data.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [frames]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Vocal Pitch Analyzer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Autocorrelation pitch detection ¬note histogram ¬CSV export</p>
          </div>
          <div className="flex items-center gap-2">
            {frames.length > 0 && (
              <button onClick={exportCsv} className="text-[9px] text-slate-600 border border-white/[0.06] px-2 py-1 rounded-lg hover:text-slate-400 hover:border-white/10 transition-all">
                ‚ÜCSV
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              <button onClick={analyze} disabled={analyzing}
                className="w-full py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white hover:bg-cyan-500/15 transition-all disabled:opacity-40">
                {analyzing ? '‚èAnalyzing pitch‚Ä¶' : 'üéAnalyze Pitch'}
              </button>

              {/* Pitch track canvas */}
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <canvas ref={canvasRef} width={460} height={140} className="w-full" style={{ background: '#0a0f1a' }} />
              </div>
              {frames.length > 0 && <p className="text-[7px] text-slate-700 text-center -mt-2">Pitch track ‚Ätime ‚Üfrequency (log scale) ¬color = confidence</p>}

              {/* Summary */}
              <AnimatePresence>
                {frames.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Key stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-center">
                        <p className="text-[7px] text-cyan-600 uppercase tracking-widest">Dominant note</p>
                        <p className="text-2xl font-bold text-cyan-300">{topNote}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Avg freq</p>
                        <p className="text-[14px] font-mono font-bold text-white">{avgFreq.toFixed(1)} Hz</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Confidence</p>
                        <p className="text-[14px] font-mono font-bold text-white">{(avgConfidence * 100).toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Note histogram */}
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest">Note distribution</p>
                      {sortedNotes.slice(0, 8).map(([note, count]) => (
                        <div key={note} className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-400 w-6">{note}</span>
                          <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(count / maxCount) * 100}%`,
                                background: note === topNote ? '#22d3ee' : '#a855f740',
                              }}
                            />
                          </div>
                          <span className="text-[8px] font-mono text-slate-600 w-8 text-right">{(count / maxCount * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>

                    {/* Pitch range */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <p className="text-[8px] text-slate-600 leading-relaxed">
                        {frames.length} pitched frames detected ¬{(frames.length * 1024 / (buffer.sampleRate || 44100)).toFixed(1)}s of pitched content
                        ¬Dominant: <span className="text-cyan-400">{topNote}</span>
                        {sortedNotes[1] && <> ¬Secondary: <span className="text-purple-400">{sortedNotes[1][0]}</span></>}
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
