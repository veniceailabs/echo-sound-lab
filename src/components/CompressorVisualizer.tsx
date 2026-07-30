/**
 * CompressorVisualizer â€Interactive transfer curve for a compressor/limiter
 *
 * Shows:
 * - Input/output transfer curve on a canvas (dB scale both axes)
 * - Knee region shading
 * - Gain reduction indicator for a given input level
 * - Real-time draggable threshold + ratio handles
 * - Attack/release controls
 * - GR meter (simulated for the current settings)
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface CompressorVisualizerProps {
  onClose: () => void;
}

interface CompressorSettings {
  threshold: number;   // dBFS: -60 to 0
  ratio: number;       // 1 to Inf
  knee: number;        // 0 to 20 dB
  attackMs: number;    // 0.1 to 200
  releaseMs: number;   // 10 to 2000
  makeupGain: number;  // 0 to 24 dB
}

const PRESETS: Array<{ name: string; settings: CompressorSettings }> = [
  { name: 'Gentle',       settings: { threshold: -18, ratio: 2,   knee: 8,  attackMs: 20,  releaseMs: 200,  makeupGain: 3  } },
  { name: 'Mix Bus',      settings: { threshold: -12, ratio: 4,   knee: 4,  attackMs: 10,  releaseMs: 150,  makeupGain: 4  } },
  { name: 'Mastering',    settings: { threshold: -8,  ratio: 2,   knee: 10, attackMs: 30,  releaseMs: 300,  makeupGain: 2  } },
  { name: 'Drum Bus',     settings: { threshold: -20, ratio: 6,   knee: 2,  attackMs: 5,   releaseMs: 80,   makeupGain: 6  } },
  { name: 'Vocal',        settings: { threshold: -24, ratio: 4,   knee: 3,  attackMs: 8,   releaseMs: 120,  makeupGain: 5  } },
  { name: 'Limiter',      settings: { threshold: -0.5,ratio: 100, knee: 0,  attackMs: 0.1, releaseMs: 50,   makeupGain: 0  } },
  { name: 'Heavy',        settings: { threshold: -30, ratio: 10,  knee: 1,  attackMs: 3,   releaseMs: 60,   makeupGain: 12 } },
  { name: 'Transparent',  settings: { threshold: -10, ratio: 1.5, knee: 12, attackMs: 50,  releaseMs: 500,  makeupGain: 2  } },
];

function computeOutput(inputDb: number, s: CompressorSettings): number {
  const { threshold, ratio, knee } = s;
  const halfKnee = knee / 2;

  if (inputDb <= threshold - halfKnee) {
    // Below knee: 1:1 (no compression)
    return inputDb;
  } else if (inputDb <= threshold + halfKnee && knee > 0) {
    // Knee region: smooth transition
    const x = inputDb - threshold + halfKnee;
    const slope = (1 - 1 / ratio) / (2 * knee);
    return inputDb + slope * x * x;
  } else {
    // Above threshold: apply ratio
    return threshold + (inputDb - threshold) / ratio;
  }
}

function drawCurve(canvas: HTMLCanvasElement, settings: CompressorSettings, testInputDb: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#060a10';
  ctx.fillRect(0, 0, width, height);

  const pad = 36;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const dbMin = -60;
  const dbMax = 0;

  const toX = (db: number) => pad + ((db - dbMin) / (dbMax - dbMin)) * plotW;
  const toY = (db: number) => pad + (1 - (db - dbMin) / (dbMax - dbMin)) * plotH;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let db = dbMin; db <= dbMax; db += 10) {
    const x = toX(db);
    const y = toY(db);
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + plotW, y); ctx.stroke();
  }

  // Unity gain line (diagonal)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(toX(dbMin), toY(dbMin));
  ctx.lineTo(toX(dbMax), toY(dbMax));
  ctx.stroke();
  ctx.setLineDash([]);

  // Threshold line
  const thX = toX(settings.threshold);
  ctx.strokeStyle = 'rgba(251,146,60,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(thX, pad); ctx.lineTo(thX, pad + plotH); ctx.stroke();
  ctx.setLineDash([]);

  // Knee shading
  if (settings.knee > 0) {
    const halfKnee = settings.knee / 2;
    ctx.fillStyle = 'rgba(251,146,60,0.04)';
    ctx.fillRect(toX(settings.threshold - halfKnee), pad, toX(settings.threshold + halfKnee) - toX(settings.threshold - halfKnee), plotH);
  }

  // Transfer curve
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let inputDb = dbMin; inputDb <= dbMax; inputDb += 0.5) {
    const outputDb = computeOutput(inputDb, settings) + settings.makeupGain;
    const x = toX(inputDb);
    const y = toY(Math.min(dbMax, outputDb));
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Test input indicator
  const testOutputDb = computeOutput(testInputDb, settings) + settings.makeupGain;
  const gainReduction = testOutputDb - testInputDb - settings.makeupGain + settings.makeupGain;
  const actualGR = (computeOutput(testInputDb, settings) + settings.makeupGain) - testInputDb;

  // Vertical line at test input
  ctx.strokeStyle = 'rgba(168,85,247,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(toX(testInputDb), pad);
  ctx.lineTo(toX(testInputDb), toY(Math.min(dbMax, testOutputDb)));
  ctx.stroke();
  // Horizontal line at test output
  ctx.beginPath();
  ctx.moveTo(pad, toY(Math.min(dbMax, testOutputDb)));
  ctx.lineTo(toX(testInputDb), toY(Math.min(dbMax, testOutputDb)));
  ctx.stroke();
  ctx.setLineDash([]);

  // Dot at intersection
  ctx.fillStyle = '#a855f7';
  ctx.beginPath();
  ctx.arc(toX(testInputDb), toY(Math.min(dbMax, testOutputDb)), 5, 0, Math.PI * 2);
  ctx.fill();

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  for (let db = dbMin; db <= dbMax; db += 10) {
    ctx.fillText(`${db}`, toX(db), pad + plotH + 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${db}`, pad - 4, toY(db) + 3);
    ctx.textAlign = 'center';
  }

  // Axis titles
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '8px monospace';
  ctx.fillText('Input (dBFS)', pad + plotW / 2, height - 4);
  ctx.save();
  ctx.translate(10, pad + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Output (dBFS)', 0, 0);
  ctx.restore();

  // GR annotation
  ctx.fillStyle = '#a855f7';
  ctx.textAlign = 'left';
  ctx.font = 'bold 9px monospace';
  ctx.fillText(`GR: ${actualGR.toFixed(1)} dB`, toX(testInputDb) + 6, toY(Math.min(dbMax, testOutputDb)) - 6);
}

function Knob({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</label>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400 h-1"
      />
      <span className="text-[9px] font-mono text-slate-400 text-right">{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
    </div>
  );
}

export const CompressorVisualizer: React.FC<CompressorVisualizerProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<CompressorSettings>(PRESETS[1].settings);
  const [testInput, setTestInput] = useState(-18);
  const [selectedPreset, setSelectedPreset] = useState(1);

  const patch = useCallback((key: keyof CompressorSettings, value: number) => {
    setSettings(s => ({ ...s, [key]: value }));
    setSelectedPreset(-1);
  }, []);

  const loadPreset = useCallback((idx: number) => {
    setSettings({ ...PRESETS[idx].settings });
    setSelectedPreset(idx);
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      drawCurve(canvasRef.current, settings, testInput);
    }
  }, [settings, testInput]);

  const testOutput = computeOutput(testInput, settings) + settings.makeupGain;
  const gainReduction = testOutput - testInput;

  const rationLabel = settings.ratio >= 100 ? 'âˆ: 1' : `${settings.ratio.toFixed(1)} : 1`;

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
        className="w-full max-w-2xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Compressor Visualizer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Transfer curve Âknee Âgain reduction Âdrag the slider to test
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                onClick={() => loadPreset(i)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-semibold border transition-all ${
                  selectedPreset === i
                    ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-200'
                    : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div className="rounded-xl overflow-hidden border border-white/[0.06]">
            <canvas
              ref={canvasRef}
              width={560}
              height={300}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>

          {/* Test input slider */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-purple-400 uppercase tracking-widest">Test signal level</p>
              <div className="flex gap-4 text-[9px] font-mono">
                <span className="text-slate-500">In: <span className="text-slate-200">{testInput.toFixed(1)} dB</span></span>
                <span className="text-slate-500">Out: <span className="text-slate-200">{testOutput.toFixed(1)} dB</span></span>
                <span className="text-slate-500">GR: <span className={gainReduction < -0.1 ? 'text-red-300' : 'text-emerald-300'}>{gainReduction.toFixed(1)} dB</span></span>
              </div>
            </div>
            <input
              type="range"
              min={-60} max={0} step={0.5} value={testInput}
              onChange={e => setTestInput(Number(e.target.value))}
              className="w-full accent-purple-400 h-1"
            />
            <div className="flex justify-between text-[7px] text-slate-700">
              <span>-60 dBFS</span><span>-30</span><span>0 dBFS</span>
            </div>
          </div>

          {/* Settings grid */}
          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <Knob label="Threshold" value={settings.threshold} min={-60} max={0} step={0.5} unit=" dB" onChange={v => patch('threshold', v)} />
            <div className="flex flex-col gap-0.5">
              <label className="text-[7px] text-slate-600 uppercase tracking-widest">Ratio</label>
              <input
                type="range"
                min={1} max={20} step={0.1} value={Math.min(20, settings.ratio)}
                onChange={e => patch('ratio', Number(e.target.value) >= 20 ? 100 : Number(e.target.value))}
                className="w-full accent-cyan-400 h-1"
              />
              <span className="text-[9px] font-mono text-slate-400 text-right">{rationLabel}</span>
            </div>
            <Knob label="Knee" value={settings.knee} min={0} max={20} step={0.5} unit=" dB" onChange={v => patch('knee', v)} />
            <Knob label="Attack" value={settings.attackMs} min={0.1} max={200} step={0.1} unit=" ms" onChange={v => patch('attackMs', v)} />
            <Knob label="Release" value={settings.releaseMs} min={10} max={2000} step={10} unit=" ms" onChange={v => patch('releaseMs', v)} />
            <Knob label="Makeup Gain" value={settings.makeupGain} min={0} max={24} step={0.5} unit=" dB" onChange={v => patch('makeupGain', v)} />
          </div>

          {/* Info callouts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
              <p className="text-[8px] text-slate-600 uppercase tracking-widest">Ratio guide</p>
              {[
                ['1.5â€“2 : 1', 'Subtle, transparent'],
                ['3â€“4 : 1', 'Classic mix bus'],
                ['6â€“10 : 1', 'Heavy limiting'],
                ['âˆ: 1', 'Hard brick-wall limiter'],
              ].map(([r, d]) => (
                <div key={r} className="flex justify-between">
                  <span className="text-[8px] font-mono text-slate-400">{r}</span>
                  <span className="text-[8px] text-slate-600">{d}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
              <p className="text-[8px] text-slate-600 uppercase tracking-widest">Attack guide</p>
              {[
                ['< 5ms', 'Kills transients (drums)'],
                ['5â€“20ms', 'Controls dynamics, punch remains'],
                ['20â€“50ms', 'Transparent, natural'],
                ['> 50ms', 'Slow â€transients pass through'],
              ].map(([r, d]) => (
                <div key={r} className="flex justify-between">
                  <span className="text-[8px] font-mono text-slate-400">{r}</span>
                  <span className="text-[8px] text-slate-600">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
