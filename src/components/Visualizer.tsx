import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../services/audioEngine';
import { customRenderers, extendedVisualizerStyles, VisualizerStyle, RenderParams } from './visualizers';

interface VisualizerProps {
  isPlaying: boolean;
  currentTime: number;
  buffer?: AudioBuffer | null;
  onSeek: (time: number) => void;
  onPlayheadUpdate: (time: number) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, currentTime, buffer, onSeek, onPlayheadUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [visualizerStyle, setVisualizerStyle] = useState<VisualizerStyle>('spectrum');
  const rendererInitRef = useRef<string | null>(null);
  const spectrumRef = useRef<number[]>([]);
  const energyRef = useRef<{ low: number; mid: number; high: number; air: number }>({
    low: 0,
    mid: 0,
    high: 0,
    air: 0,
  });
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const spectrumStart = { r: 72, g: 136, b: 255 };
  const spectrumEnd = { r: 150, g: 226, b: 255 };


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    const analyser = audioEngine.getAnalyserNode();
    analyser.smoothingTimeConstant = 0.4; // Low smoothing for responsive feel
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.fftSize);
    spectrumRef.current = [];
    energyRef.current = { low: 0, mid: 0, high: 0, air: 0 };

    const renderSpectrum = () => {
      ctx.fillStyle = 'rgb(12,16,24)';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const barWidth = 3;
      const barGap = 2;
      const margin = rect.width * 0.03;
      const usableWidth = rect.width - margin * 2;
      const barCount = Math.floor(usableWidth / (barWidth + barGap));

      if (spectrumRef.current.length !== barCount) {
        spectrumRef.current = Array.from({ length: barCount }, () => 0);
      }

      const maxHeight = rect.height * 0.85;
      const bottomMargin = rect.height * 0.08;

      for (let i = 0; i < barCount; i++) {
        const t = barCount > 1 ? i / (barCount - 1) : 0;
        const idx = Math.floor(Math.pow(t, 1.8) * (freqData.length - 1));
        const amp = freqData[idx] / 255;
        const prev = spectrumRef.current[i];
        // Fast attack, moderate release - feel every hit
        const value = amp > prev ? lerp(prev, amp, 0.85) : lerp(prev, amp, 0.25);
        spectrumRef.current[i] = value;

        const barHeight = Math.max(2, value * maxHeight);
        const x = margin + i * (barWidth + barGap);
        const y = rect.height - bottomMargin - barHeight;

        // Brightness responds to amplitude
        const brightness = 0.6 + value * 0.4;
        const r = Math.round(lerp(100, 200, t) * brightness);
        const g = Math.round(lerp(160, 140, t) * brightness);
        const b = Math.round(lerp(220, 200, t) * brightness);

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    const renderScope = () => {
      ctx.fillStyle = 'rgb(12,16,24)';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const centerY = rect.height / 2;
      const amplitude = rect.height * 0.42;
      const margin = rect.width * 0.03;

      // Direct waveform - no smoothing, every sample
      ctx.strokeStyle = 'rgb(120,170,220)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        const x = margin + (i / (timeData.length - 1)) * (rect.width - margin * 2);
        const y = centerY + v * amplitude;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      const nowMs = performance.now();
      analyser.getByteFrequencyData(freqData);

      // Update energy bands for all visualizers
      const lowCount = Math.floor(freqData.length * 0.18);
      const midCount = Math.floor(freqData.length * 0.55);
      const highCount = Math.floor(freqData.length * 0.82);
      let low = 0, mid = 0, high = 0, air = 0;
      for (let i = 0; i < freqData.length; i++) {
        const v = freqData[i];
        if (i < lowCount) low += v;
        else if (i < midCount) mid += v;
        else if (i < highCount) high += v;
        else air += v;
      }
      energyRef.current.low = lerp(energyRef.current.low, low / Math.max(lowCount, 1) / 255, 0.1);
      energyRef.current.mid = lerp(energyRef.current.mid, mid / Math.max(midCount - lowCount, 1) / 255, 0.1);
      energyRef.current.high = lerp(energyRef.current.high, high / Math.max(highCount - midCount, 1) / 255, 0.1);
      energyRef.current.air = lerp(energyRef.current.air, air / Math.max(freqData.length - highCount, 1) / 255, 0.1);

      // Get time domain data for visualizers that need it
      if (visualizerStyle === 'scope' || visualizerStyle === 'pulseline') {
        analyser.getByteTimeDomainData(timeData);
      }

      // Check for custom renderer
      const customRenderer = customRenderers[visualizerStyle];
      if (customRenderer) {
        // Initialize custom renderer if needed
        if (rendererInitRef.current !== visualizerStyle) {
          customRenderer.init?.(ctx, rect.width, rect.height);
          rendererInitRef.current = visualizerStyle;
        }

        const renderParams: RenderParams = {
          width: rect.width,
          height: rect.height,
          freqData,
          timeData,
          energy: energyRef.current,
          isPlaying,
          timeMs: nowMs,
        };
        customRenderer.render(ctx, renderParams);
        return;
      }

      // Built-in visualizers
      switch (visualizerStyle) {
        case 'scope':
          renderScope();
          break;
        case 'spectrum':
        default:
          renderSpectrum();
          break;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, buffer, visualizerStyle]);


  useEffect(() => {
    let interval: number;
    if (isPlaying) {
        interval = window.setInterval(() => {
            onPlayheadUpdate(audioEngine.getCurrentTime());
        }, 100); 
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [isPlaying, onPlayheadUpdate]);


  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const duration = audioEngine.getDuration();
      
      if (duration > 0) {
          const seekTime = (x / width) * duration;
          onSeek(seekTime);
      }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const duration = audioEngine.getDuration();
      
      if (duration > 0) {
          const time = (x / width) * duration;
          const mins = Math.floor(time / 60);
          const secs = Math.floor(time % 60).toString().padStart(2, '0');
          setHoverTime(`${mins}:${secs}`);
          setHoverX(x);
      }
  };

  const handleMouseLeave = () => {
      setHoverTime(null);
      setHoverX(null);
  };

  const duration = audioEngine.getDuration();
  const currentMins = Math.floor(currentTime / 60);
  const currentSecs = Math.floor(currentTime % 60).toString().padStart(2, '0');
  const totalMins = Math.floor(duration / 60);
  const totalSecs = Math.floor(duration % 60).toString().padStart(2, '0');
  const visualizerStyles = extendedVisualizerStyles;

  return (
    <div className="space-y-3">
      <div className="w-full h-64 rounded-2xl p-2 bg-slate-950/70 border border-slate-800/70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]" style={{ minHeight: '256px' }}>
        <div className="w-full h-full rounded-xl overflow-hidden relative bg-slate-950/90 border border-slate-800/60" style={{ minHeight: '100%' }}>
          <div className="absolute top-3 left-4 text-[10px] text-slate-500 font-bold tracking-widest opacity-60 pointer-events-none">
            WAVEFORM
          </div>
          {hoverTime && hoverX !== null && (
            <div
              className="absolute top-8 bg-slate-900 text-orange-400 text-[10px] font-bold px-2 py-1 rounded pointer-events-none shadow-lg z-10"
              style={{ left: hoverX, transform: 'translateX(-50%)' }}
            >
              {hoverTime}
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={800}
            height={256}
            className="w-full h-full opacity-90 cursor-crosshair"
            onClick={handleSeek}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/70 rounded-2xl border border-slate-800/60">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Visualizer Style</span>
        <div className="flex items-center gap-2">
          {visualizerStyles.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => setVisualizerStyle(style.value)}
              className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-wider border transition-all ${
                visualizerStyle === style.value
                  ? 'border-orange-400/60 text-orange-300 bg-orange-500/10'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
              }`}
              title={style.description}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-4 px-5 py-3 bg-slate-900/70 rounded-2xl border border-slate-800/60 shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]">
        <button
          onClick={() => audioEngine.skipBackward(10)}
          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/60 hover:border-orange-400/40 transition-all group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Rewind 10s (Shift+←)"
        >
          <svg className="w-4.5 h-4.5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
        </button>
        <button
          onClick={() => audioEngine.skipBackward(5)}
          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/60 hover:border-orange-400/40 transition-all group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Rewind 5s (←)"
        >
          <svg className="w-4.5 h-4.5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="px-4 py-2 bg-slate-900/80 rounded-full text-xs text-orange-400 font-mono font-bold min-w-[100px] text-center border border-slate-800/70">
          {currentMins}:{currentSecs} / {totalMins}:{totalSecs}
        </div>
        <button
          onClick={() => audioEngine.skipForward(5)}
          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/60 hover:border-orange-400/40 transition-all group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Forward 5s (→)"
        >
          <svg className="w-4.5 h-4.5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => audioEngine.skipForward(10)}
          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/60 hover:border-orange-400/40 transition-all group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Forward 10s (Shift+→)"
        >
          <svg className="w-4.5 h-4.5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Visualizer;
