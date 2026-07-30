/**
 * ReferenceMatcherPanel �Match your mix to a professional reference track
 *
 * Analyzes two tracks and computes:
 *   �Integrated LUFS delta (loudness difference)
 *   �Spectral balance delta per octave band (7 bands)
 *   �Stereo width delta (LR correlation)
 *   �Dynamic range delta (LRA)
 *   �True-peak delta
 *
 * Outputs:
 *   �Side-by-side waveform comparison
 *   �Per-band EQ action list (boost/cut/target dB)
 *   �One-click "Apply Reference Preset" �builds a custom EQ + gain curve
 *     and writes it to a JSON preset file the user can import in any DAW
 *   �Export matching report as CSV
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReferenceMatcherPanelProps {
  buffer: AudioBuffer | null;   // user's mix
  onClose: () => void;
}

// ── DSP helpers ──────────────────────────────────────────────────────────────

function rmsOf(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (data.length || 1));
}

function linToDb(lin: number): number {
  return lin > 0 ? 20 * Math.log10(lin) : -100;
}

function correlationOf(L: Float32Array, R: Float32Array, n: number): number {
  let sumLR = 0, sumL2 = 0, sumR2 = 0;
  const step = Math.max(1, Math.floor(n / 8000)); // downsample for speed
  for (let i = 0; i < n; i += step) {
    sumLR += L[i] * R[i];
    sumL2 += L[i] * L[i];
    sumR2 += R[i] * R[i];
  }
  const denom = Math.sqrt(sumL2 * sumR2);
  return denom > 0 ? sumLR / denom : 0;
}

interface BandResult {
  name: string;
  low: number;
  high: number;
  color: string;
  mixDb: number;
  refDb: number;
  deltaDb: number;
}

const BANDS = [
  { name: 'Sub',       low: 20,    high: 60,    color: '#7c3aed' },
  { name: 'Bass',      low: 60,    high: 250,   color: '#2563eb' },
  { name: 'Low-mid',   low: 250,   high: 500,   color: '#0891b2' },
  { name: 'Mid',       low: 500,   high: 2000,  color: '#059669' },
  { name: 'Upper-mid', low: 2000,  high: 6000,  color: '#d97706' },
  { name: 'Presence',  low: 6000,  high: 12000, color: '#dc2626' },
  { name: 'Air',       low: 12000, high: 20000, color: '#db2777' },
];

async function getBandEnergies(buf: AudioBuffer): Promise<number[]> {
  const fftSize = 8192;
  const offCtx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
  const src = offCtx.createBufferSource();
  src.buffer = buf;
  const analyser = offCtx.createAnalyser();
  analyser.fftSize = fftSize;
  src.connect(analyser);
  analyser.connect(offCtx.destination);
  src.start(0);
  await offCtx.startRendering();

  const data = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(data);

  const binWidth = buf.sampleRate / fftSize;
  return BANDS.map(band => {
    const lo = Math.floor(band.low / binWidth);
    const hi = Math.min(Math.ceil(band.high / binWidth), data.length - 1);
    let sum = 0, cnt = 0;
    for (let i = lo; i <= hi; i++) {
      sum += data[i]; // already in dB from getFloatFrequencyData
      cnt++;
    }
    return cnt > 0 ? sum / cnt : -100;
  });
}

interface AnalysisResult {
  lufs: number;
  truePeak: number;
  lra: number;
  width: number;        // 0-1 stereo width (derived from correlation)
  bandDb: number[];     // raw average dB per band (not normalized)
}

function analyzeBuffer(buf: AudioBuffer): AnalysisResult {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0);
  const n = L.length;

  const rmsL = rmsOf(L);
  const rmsR = rmsOf(R);
  const rms = (rmsL + rmsR) / 2;
  const lufs = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -70;

  let tp = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(L[i]) > tp) tp = Math.abs(L[i]);
    if (Math.abs(R[i]) > tp) tp = Math.abs(R[i]);
  }

  const corr = correlationOf(L, R, n);
  const width = Math.max(0, Math.min(1, (1 - corr) * 0.5));

  // Rough LRA via RMS variance across 3s blocks
  const blockSz = Math.floor(3 * buf.sampleRate);
  const blockLufs: number[] = [];
  for (let s = 0; s + blockSz <= n; s += blockSz) {
    let sum = 0;
    for (let i = s; i < s + blockSz; i++) sum += L[i] * L[i] + R[i] * R[i];
    const m = sum / (blockSz * 2);
    if (m > 0) blockLufs.push(-0.691 + 10 * Math.log10(m));
  }
  blockLufs.sort((a, b) => a - b);
  const lra = blockLufs.length >= 2
    ? blockLufs[Math.floor(blockLufs.length * 0.95)] - blockLufs[Math.floor(blockLufs.length * 0.10)]
    : 0;

  return { lufs, truePeak: linToDb(tp), lra: Math.max(0, lra), width, bandDb: [] };
}

function drawWaveform(canvas: HTMLCanvasElement, buf: AudioBuffer, color: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, W, H);

  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  ctx.fillStyle = color + '88';
  for (let x = 0; x < W; x++) {
    let max = 0;
    for (let i = x * step; i < (x + 1) * step && i < data.length; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    const h = max * (H / 2);
    ctx.fillRect(x, H / 2 - h, 1, h * 2);
  }
}

const ACTION_THRESHOLD = 1.5; // dB difference to flag

export const ReferenceMatcherPanel: React.FC<ReferenceMatcherPanelProps> = ({ buffer, onClose }) => {
  const [refBuffer, setRefBuffer] = useState<AudioBuffer | null>(null);
  const [refName, setRefName] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [mixAnalysis, setMixAnalysis] = useState<AnalysisResult | null>(null);
  const [refAnalysis, setRefAnalysis] = useState<AnalysisResult | null>(null);
  const [bands, setBands] = useState<BandResult[] | null>(null);
  const mixCanvasRef = useRef<HTMLCanvasElement>(null);
  const refCanvasRef = useRef<HTMLCanvasElement>(null);

  const loadRef = useCallback(async (file: File) => {
    const ctx = new AudioContext();
    const ab = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    setRefBuffer(buf);
    setRefName(file.name);
    if (refCanvasRef.current) drawWaveform(refCanvasRef.current, buf, '#a855f7');
    setRefAnalysis(null);
    setBands(null);
  }, []);

  const analyze = useCallback(async () => {
    if (!buffer || !refBuffer) return;
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 10));

    const [mxBands, rfBands] = await Promise.all([
      getBandEnergies(buffer),
      getBandEnergies(refBuffer),
    ]);
    const mx = { ...analyzeBuffer(buffer), bandDb: mxBands };
    const rf = { ...analyzeBuffer(refBuffer), bandDb: rfBands };

    if (mixCanvasRef.current) drawWaveform(mixCanvasRef.current, buffer, '#22d3ee');
    if (refCanvasRef.current) drawWaveform(refCanvasRef.current, refBuffer, '#a855f7');

    const bandResults: BandResult[] = BANDS.map((band, i) => ({
      ...band,
      mixDb: mx.bandDb[i],
      refDb: rf.bandDb[i],
      deltaDb: mx.bandDb[i] - rf.bandDb[i],
    }));

    setMixAnalysis(mx);
    setRefAnalysis(rf);
    setBands(bandResults);
    setAnalyzing(false);
  }, [buffer, refBuffer]);

  const exportCsv = useCallback(() => {
    if (!bands || !mixAnalysis || !refAnalysis) return;
    const rows = [
      'Metric,Mix,Reference,Delta',
      `LUFS (integrated),${mixAnalysis.lufs.toFixed(1)},${refAnalysis.lufs.toFixed(1)},${(mixAnalysis.lufs - refAnalysis.lufs).toFixed(1)}`,
      `True Peak (dBTP),${mixAnalysis.truePeak.toFixed(1)},${refAnalysis.truePeak.toFixed(1)},${(mixAnalysis.truePeak - refAnalysis.truePeak).toFixed(1)}`,
      `LRA (LU),${mixAnalysis.lra.toFixed(1)},${refAnalysis.lra.toFixed(1)},${(mixAnalysis.lra - refAnalysis.lra).toFixed(1)}`,
      `Stereo Width,${mixAnalysis.width.toFixed(2)},${refAnalysis.width.toFixed(2)},${(mixAnalysis.width - refAnalysis.width).toFixed(2)}`,
      '',
      'Band,Mix (dB avg),Reference (dB avg),Delta (dB)',
      ...bands.map(b => `${b.name},${b.mixDb.toFixed(1)},${b.refDb.toFixed(1)},${b.deltaDb.toFixed(1)}`),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'reference_match.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [bands, mixAnalysis, refAnalysis]);

  const exportPreset = useCallback(() => {
    if (!bands || !mixAnalysis || !refAnalysis) return;
    const lufsGain = refAnalysis.lufs - mixAnalysis.lufs;
    const eqBands = bands
      .filter(b => Math.abs(b.deltaDb) >= ACTION_THRESHOLD)
      .map(b => ({
        frequency: Math.round(Math.sqrt(b.low * b.high)),
        gain: parseFloat((-b.deltaDb * 0.7).toFixed(1)), // 70% correction
        Q: 0.8,
        type: 'peaking',
        band: b.name,
      }));

    const preset = {
      name: `Match to ${refName}`,
      generated: new Date().toISOString(),
      gain_db: parseFloat(lufsGain.toFixed(1)),
      eq_bands: eqBands,
      target_lufs: refAnalysis.lufs,
      source: 'Echo Sound Lab Reference Matcher v2.5',
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'reference_preset.json'; a.click();
    URL.revokeObjectURL(url);
  }, [bands, mixAnalysis, refAnalysis, refName]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Reference Matcher</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Compare your mix against a professional reference track</p>
          </div>
          <div className="flex items-center gap-2">
            {bands && (
              <>
                <button onClick={exportPreset} className="text-[9px] text-purple-400 border border-purple-500/30 px-2 py-1 rounded-lg hover:bg-purple-500/10 transition-all">
                  �EQ Preset
                </button>
                <button onClick={exportCsv} className="text-[9px] text-slate-600 border border-white/[0.06] px-2 py-1 rounded-lg hover:text-slate-400 transition-all">
                  �CSV
                </button>
              </>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}
          {buffer && (
            <>
              {/* Two-track slot layout */}
              <div className="grid grid-cols-2 gap-3">
                {/* Mix slot */}
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3 space-y-2">
                  <p className="text-[8px] text-cyan-600 uppercase tracking-widest font-semibold">Your Mix</p>
                  <div className="rounded-lg overflow-hidden border border-white/[0.04]">
                    <canvas ref={mixCanvasRef} width={200} height={48} className="w-full" style={{ background: '#0a0f1a' }} />
                  </div>
                  <p className="text-[8px] text-slate-600 truncate">Loaded track</p>
                </div>

                {/* Reference slot */}
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-3 space-y-2">
                  <p className="text-[8px] text-purple-600 uppercase tracking-widest font-semibold">Reference</p>
                  <div className="rounded-lg overflow-hidden border border-white/[0.04]">
                    <canvas ref={refCanvasRef} width={200} height={48} className="w-full" style={{ background: '#0a0f1a' }} />
                  </div>
                  <label className="block cursor-pointer">
                    <input type="file" accept="audio/*" className="hidden" onChange={e => { if (e.target.files?.[0]) loadRef(e.target.files[0]); }} />
                    <span className="text-[8px] text-purple-500 hover:text-purple-300 transition-colors">
                      {refName ? `📄 ${refName}` : '+ Load reference…'}
                    </span>
                  </label>
                </div>
              </div>

              <button onClick={analyze} disabled={analyzing || !refBuffer}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/15 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {analyzing ? '�Comparing tracks…' : refBuffer ? '�Compare vs Reference' : 'Load a reference track first'}
              </button>

              <AnimatePresence>
                {bands && mixAnalysis && refAnalysis && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Global metrics */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'LUFS Δ', value: mixAnalysis.lufs - refAnalysis.lufs, unit: '' },
                        { label: 'True Peak Δ', value: mixAnalysis.truePeak - refAnalysis.truePeak, unit: 'dB' },
                        { label: 'LRA Δ', value: mixAnalysis.lra - refAnalysis.lra, unit: ' LU' },
                        { label: 'Width Δ', value: (mixAnalysis.width - refAnalysis.width) * 100, unit: '%' },
                      ].map(({ label, value, unit }) => {
                        const isGood = Math.abs(value) < 1.5;
                        const color = isGood ? '#10b981' : Math.abs(value) < 4 ? '#f59e0b' : '#ef4444';
                        return (
                          <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-center">
                            <p className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</p>
                            <p className="text-sm font-bold font-mono" style={{ color }}>
                              {value > 0 ? '+' : ''}{value.toFixed(1)}{unit}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Spectral band comparison */}
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest">Spectral balance vs reference</p>
                      {bands.map(band => {
                        const tooMuch = band.deltaDb > ACTION_THRESHOLD;
                        const tooLittle = band.deltaDb < -ACTION_THRESHOLD;
                        const needsAction = tooMuch || tooLittle;
                        const actionDb = (-band.deltaDb * 0.7).toFixed(1);
                        return (
                          <div key={band.name} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: band.color }} />
                                <span className="text-[8px] text-slate-400">{band.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {needsAction && (
                                  <span className="text-[7px] px-1.5 py-0.5 rounded" style={{
                                    background: tooMuch ? 'rgba(245,158,11,0.1)' : 'rgba(34,211,238,0.1)',
                                    color: tooMuch ? '#f59e0b' : '#22d3ee',
                                  }}>
                                    {tooMuch ? `�cut ${actionDb.startsWith('-') ? actionDb.slice(1) : actionDb} dB` : `↑ boost ${actionDb.replace('-', '')} dB`}
                                  </span>
                                )}
                                <span className="text-[8px] font-mono w-12 text-right" style={{
                                  color: Math.abs(band.deltaDb) < ACTION_THRESHOLD ? '#64748b' : band.deltaDb > 0 ? '#f59e0b' : '#22d3ee',
                                }}>
                                  {band.deltaDb > 0 ? '+' : ''}{band.deltaDb.toFixed(1)} dB
                                </span>
                              </div>
                            </div>
                            {/* Bar comparison */}
                            <div className="flex gap-1 items-center">
                              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${Math.min(100, Math.max(0, (band.mixDb + 60) / 60 * 100))}%`,
                                  background: '#22d3ee88',
                                }} />
                              </div>
                              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${Math.min(100, Math.max(0, (band.refDb + 60) / 60 * 100))}%`,
                                  background: '#a855f788',
                                }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-[7px] text-slate-700 pt-1">Cyan = your mix �Purple = reference</p>
                    </div>

                    {/* Summary actions */}
                    {bands.some(b => Math.abs(b.deltaDb) >= ACTION_THRESHOLD) ? (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Suggested actions</p>
                        {mixAnalysis.lufs - refAnalysis.lufs > 1.5 && (
                          <p className="text-[8px] text-amber-400">�Your mix is {(mixAnalysis.lufs - refAnalysis.lufs).toFixed(1)} LUFS louder �reduce master gain</p>
                        )}
                        {refAnalysis.lufs - mixAnalysis.lufs > 1.5 && (
                          <p className="text-[8px] text-cyan-400">↑ Your mix is {(refAnalysis.lufs - mixAnalysis.lufs).toFixed(1)} LUFS quieter �increase master gain</p>
                        )}
                        {bands.filter(b => Math.abs(b.deltaDb) >= ACTION_THRESHOLD).map(b => (
                          <p key={b.name} className="text-[8px] text-slate-500 leading-relaxed">
                            <span style={{ color: b.color }}>{b.name}</span>
                            {b.deltaDb > 0
                              ? ` is ${b.deltaDb.toFixed(1)} dB too present �try cutting ~${(-b.deltaDb * 0.7).toFixed(1)} dB around ${b.low < 1000 ? `${b.low}–${b.high}Hz` : `${(b.low / 1000).toFixed(0)}–${(b.high / 1000).toFixed(0)}kHz`}`
                              : ` is ${Math.abs(b.deltaDb).toFixed(1)} dB too thin �try boosting ~${(b.deltaDb * -0.7).toFixed(1)} dB around ${b.low < 1000 ? `${b.low}–${b.high}Hz` : `${(b.low / 1000).toFixed(0)}–${(b.high / 1000).toFixed(0)}kHz`}`
                            }
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-center">
                        <p className="text-[10px] text-emerald-400 font-semibold">�Excellent match �spectral balance within ±{ACTION_THRESHOLD} dB of reference</p>
                      </div>
                    )}
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
