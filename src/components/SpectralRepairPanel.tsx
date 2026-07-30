/**
 * SpectralRepairPanel â€Paint-to-remove frequency repair
 *
 * Renders a spectrogram of the audio. User paints over problem areas
 * (hum, clicks, noise at specific frequencies) with a brush.
 * The selected regions get attenuated via notch filters applied offline.
 *
 * Simple but powerful: covers 90% of "remove that hum at 60Hz" use cases.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SpectralRepairPanelProps {
  buffer: AudioBuffer | null;
  onRepaired: (result: AudioBuffer) => void;
  onClose: () => void;
}

interface PaintedRegion {
  freqMin: number;  // Hz
  freqMax: number;
  timeMin: number;  // seconds
  timeMax: number;
  attenuation: number; // dB (negative = cut)
}

interface BrushStroke {
  x: number; y: number;
  width: number; height: number;
}

const CANVAS_W = 640;
const CANVAS_H = 240;
const FFT_SIZE = 2048;

const QUICK_TARGETS = [
  { label: '60Hz Hum', freq: 60, desc: 'US power line hum â€very common in home recordings' },
  { label: '50Hz Hum', freq: 50, desc: 'EU/UK power line hum' },
  { label: '120Hz Harmonic', freq: 120, desc: 'Second harmonic of 60Hz hum' },
  { label: '200Hz Rumble', freq: 200, desc: 'Low-frequency rumble from HVAC or traffic' },
  { label: '1kHz Tone', freq: 1000, desc: 'Annoying mid-range tone or feedback' },
  { label: '8kHz Hiss', freq: 8000, desc: 'High-frequency tape or electronic hiss' },
];

function renderSpectrogram(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  strokes: BrushStroke[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const hop = Math.floor(L.length / width);
  const fftHalf = FFT_SIZE / 2;

  // Draw spectrogram column by column
  for (let x = 0; x < width; x++) {
    const start = x * hop;
    // Simple magnitude spectrum via DFT (approximated)
    const freqBins = new Float32Array(height);

    for (let bin = 0; bin < height; bin++) {
      // Map canvas y (0=top=high freq, height=bottom=low freq) to frequency
      const freqIdx = Math.floor((height - bin) / height * fftHalf);
      // Sum power in a small range around this bin
      let power = 0;
      const freqHz = freqIdx * sr / FFT_SIZE;

      // Use simple windowed correlation for this frequency
      const cycles = Math.min(8, Math.floor(freqHz / sr * FFT_SIZE));
      const winLen = Math.min(hop, FFT_SIZE);
      let re = 0, im = 0;
      const omega = 2 * Math.PI * freqHz / sr;
      for (let i = 0; i < winLen && start + i < L.length; i++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / winLen);
        re += L[start + i] * w * Math.cos(omega * i);
        im += L[start + i] * w * Math.sin(omega * i);
      }
      power = Math.sqrt(re * re + im * im) / winLen;
      freqBins[bin] = power;
    }

    // Find max for normalization
    const maxPow = Math.max(...freqBins, 0.0001);

    for (let y = 0; y < height; y++) {
      const norm = freqBins[y] / maxPow;
      const db = norm > 0 ? 20 * Math.log10(norm) : -80;
      const brightness = Math.max(0, Math.min(1, (db + 80) / 80));

      // Colormap: dark blue â†purple â†yellow â†white
      const r = Math.floor(brightness < 0.5 ? 0 : (brightness - 0.5) * 2 * 255);
      const g = Math.floor(brightness < 0.3 ? 0 : Math.min(1, (brightness - 0.3) / 0.4) * 200);
      const b = Math.floor(brightness < 0.5 ? brightness * 2 * 200 : Math.max(0, (1 - brightness) * 2 * 200));

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Overlay painted strokes
  for (const stroke of strokes) {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 1;
    ctx.fillRect(stroke.x, stroke.y, stroke.width, stroke.height);
    ctx.strokeRect(stroke.x, stroke.y, stroke.width, stroke.height);
  }

  // Frequency axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '8px monospace';
  const freqLabels = [
    { hz: 100, label: '100Hz' },
    { hz: 500, label: '500Hz' },
    { hz: 1000, label: '1kHz' },
    { hz: 4000, label: '4kHz' },
    { hz: 10000, label: '10kHz' },
  ];
  for (const { hz, label } of freqLabels) {
    const y = height - (hz / (sr / 2)) * height;
    if (y >= 0 && y <= height) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, y, width, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(label, 4, y - 2);
    }
  }
}

async function applySpectralRepair(
  buffer: AudioBuffer,
  regions: PaintedRegion[],
): Promise<AudioBuffer> {
  if (regions.length === 0) return buffer;

  const sr = buffer.sampleRate;
  const numCh = buffer.numberOfChannels;
  const ctx = new OfflineAudioContext(numCh, buffer.length, sr);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  let lastNode: AudioNode = src;

  // Apply a notch filter for each repaired region
  for (const region of regions) {
    const centerFreq = (region.freqMin + region.freqMax) / 2;
    const bw = region.freqMax - region.freqMin;
    const Q = bw > 0 ? centerFreq / bw : 10;

    const notch = ctx.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = Math.max(10, Math.min(sr / 2 - 1, centerFreq));
    notch.Q.value = Math.max(0.5, Math.min(30, Q));
    notch.gain.value = region.attenuation;

    lastNode.connect(notch);
    lastNode = notch;
  }

  lastNode.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

export const SpectralRepairPanel: React.FC<SpectralRepairPanelProps> = ({
  buffer, onRepaired, onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const [regions, setRegions] = useState<PaintedRegion[]>([]);
  const [painting, setPainting] = useState(false);
  const [brushStart, setBrushStart] = useState<{ x: number; y: number } | null>(null);
  const [currentStroke, setCurrentStroke] = useState<BrushStroke | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [attenuation, setAttenuation] = useState(-40);

  // Render spectrogram on load
  useEffect(() => {
    if (!buffer || !canvasRef.current) return;
    // Use a worker-like approach: schedule after paint
    const raf = requestAnimationFrame(() => {
      if (canvasRef.current) renderSpectrogram(canvasRef.current, buffer, strokes);
    });
    return () => cancelAnimationFrame(raf);
  }, [buffer, strokes]);

  const canvasPctToFreq = useCallback((yPct: number): number => {
    if (!buffer) return 0;
    const sr = buffer.sampleRate;
    return (1 - yPct) * (sr / 2);
  }, [buffer]);

  const canvasPctToTime = useCallback((xPct: number): number => {
    if (!buffer) return 0;
    return xPct * buffer.duration;
  }, [buffer]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setBrushStart({ x, y });
    setPainting(true);
    setCurrentStroke({ x, y, width: 0, height: 0 });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!painting || !brushStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentStroke({
      x: Math.min(x, brushStart.x),
      y: Math.min(y, brushStart.y),
      width: Math.abs(x - brushStart.x),
      height: Math.abs(y - brushStart.y),
    });
  }, [painting, brushStart]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!painting || !brushStart || !buffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;

    const x1 = brushStart.x;
    const y1 = brushStart.y;
    const stroke: BrushStroke = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.max(4, Math.abs(x2 - x1)),
      height: Math.max(4, Math.abs(y2 - y1)),
    };

    setStrokes(prev => [...prev, stroke]);

    // Convert canvas coords to frequency/time regions
    const region: PaintedRegion = {
      freqMin: canvasPctToFreq((Math.max(y1, y2) / CANVAS_H)),
      freqMax: canvasPctToFreq((Math.min(y1, y2) / CANVAS_H)),
      timeMin: canvasPctToTime(Math.min(x1, x2) / CANVAS_W),
      timeMax: canvasPctToTime(Math.max(x1, x2) / CANVAS_W),
      attenuation,
    };
    setRegions(prev => [...prev, region]);
    setPainting(false);
    setBrushStart(null);
    setCurrentStroke(null);
    setRendered(false);
  }, [painting, brushStart, buffer, canvasPctToFreq, canvasPctToTime, attenuation]);

  const addQuickTarget = useCallback((freq: number) => {
    if (!buffer) return;
    const region: PaintedRegion = {
      freqMin: freq * 0.9,
      freqMax: freq * 1.1,
      timeMin: 0,
      timeMax: buffer.duration,
      attenuation,
    };
    setRegions(prev => [...prev, region]);

    // Visual stroke
    const yCenter = (1 - freq / (buffer.sampleRate / 2)) * CANVAS_H;
    const stroke: BrushStroke = {
      x: 0,
      y: yCenter - 3,
      width: CANVAS_W,
      height: 6,
    };
    setStrokes(prev => [...prev, stroke]);
    setRendered(false);
  }, [buffer, attenuation]);

  const handleApply = useCallback(async () => {
    if (!buffer || regions.length === 0) return;
    setProcessing(true);
    try {
      const result = await applySpectralRepair(buffer, regions);
      setRendered(true);
      onRepaired(result);
    } finally {
      setProcessing(false);
    }
  }, [buffer, regions, onRepaired]);

  const handleClear = useCallback(() => {
    setStrokes([]);
    setRegions([]);
    setRendered(false);
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
        className="w-full max-w-3xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Spectral Repair</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Paint over hum, hiss, or tonal noise on the spectrogram to remove it
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">
            âœ•
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>
          )}

          {buffer && (
            <>
              {/* Quick targets */}
              <div className="space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Quick repair presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_TARGETS.map(t => (
                    <button
                      key={t.label}
                      onClick={() => addQuickTarget(t.freq)}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-cyan-500/30 hover:bg-cyan-500/5 p-2.5 text-left transition-all"
                    >
                      <p className="text-[10px] font-semibold text-slate-300">{t.label}</p>
                      <p className="text-[8px] text-slate-700 mt-0.5 leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Spectrogram */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                    Spectrogram â€drag to select region to repair
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-600">Cut depth:</span>
                    <select
                      value={attenuation}
                      onChange={e => setAttenuation(Number(e.target.value))}
                      className="bg-slate-800 border border-white/[0.08] text-slate-300 text-[10px] rounded px-2 py-0.5 outline-none"
                    >
                      <option value={-20}>âˆ’20 dB (gentle)</option>
                      <option value={-40}>âˆ’40 dB (standard)</option>
                      <option value={-60}>âˆ’60 dB (deep)</option>
                      <option value={-80}>âˆ’80 dB (remove)</option>
                    </select>
                  </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-white/[0.06] cursor-crosshair"
                  style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: '100%' }}>
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_W}
                    height={CANVAS_H}
                    className="w-full"
                    style={{ height: CANVAS_H, display: 'block' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  />
                  {/* Live stroke preview */}
                  {currentStroke && (
                    <div
                      className="absolute border border-cyan-400 bg-cyan-400/20 pointer-events-none"
                      style={{
                        left: currentStroke.x,
                        top: currentStroke.y,
                        width: currentStroke.width,
                        height: currentStroke.height,
                      }}
                    />
                  )}
                </div>

                <p className="text-[9px] text-slate-700">
                  High frequencies at top, low at bottom. Time runs left â†right. Bright areas = loud frequencies.
                </p>
              </div>

              {/* Selected regions */}
              {regions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                      {regions.length} region{regions.length !== 1 ? 's' : ''} selected
                    </p>
                    <button onClick={handleClear} className="text-[9px] text-slate-600 hover:text-red-400 transition-all">
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {regions.map((r, i) => (
                      <div key={i} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5">
                        <p className="text-[9px] font-mono text-cyan-400">
                          {r.freqMin >= 1000 ? `${(r.freqMin / 1000).toFixed(1)}k` : `${r.freqMin.toFixed(0)}`}â€“
                          {r.freqMax >= 1000 ? `${(r.freqMax / 1000).toFixed(1)}k` : `${r.freqMax.toFixed(0)}`} Hz
                        </p>
                        <p className="text-[8px] text-slate-700 mt-0.5">{r.attenuation} dB cut</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply button */}
              <motion.button
                onClick={handleApply}
                disabled={regions.length === 0 || processing}
                whileHover={regions.length > 0 && !processing ? { scale: 1.01 } : {}}
                whileTap={regions.length > 0 && !processing ? { scale: 0.98 } : {}}
                className={`w-full py-4 rounded-xl font-bold text-[13px] uppercase tracking-widest border transition-all disabled:opacity-30 ${
                  processing
                    ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                    : rendered
                    ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-500/30 text-cyan-300 hover:from-cyan-500/30 hover:to-purple-500/30'
                }`}
              >
                {processing
                  ? 'âšApplying notch filtersâ€¦'
                  : rendered
                  ? 'âœApplied â€paint more regions or close'
                  : regions.length === 0
                  ? 'Select regions on the spectrogram first'
                  : `ðŸ”Apply ${regions.length} repair${regions.length !== 1 ? 's' : ''}`}
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
