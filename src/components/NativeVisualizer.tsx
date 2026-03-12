import React, { useEffect, useRef } from 'react';
import type { AudioPlaybackEngine } from '../services/AudioPlaybackEngine';

interface NativeVisualizerProps {
  audioPlaybackEngine?: AudioPlaybackEngine | null;
  className?: string;
}

const FALLBACK_BAR_COUNT = 64;

const NativeVisualizer: React.FC<NativeVisualizerProps> = ({ audioPlaybackEngine, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return () => undefined;

    const context = canvas.getContext('2d');
    if (!context) return () => undefined;

    const analyser = audioPlaybackEngine?.getMasterAnalyserNode?.() || null;
    const binCount = analyser?.frequencyBinCount || FALLBACK_BAR_COUNT;
    const frequencyData = new Uint8Array(binCount);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(14, 165, 233, 0.25)');
      gradient.addColorStop(1, 'rgba(249, 115, 22, 0.15)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      if (analyser) {
        analyser.getByteFrequencyData(frequencyData);
      } else {
        const now = performance.now() * 0.002;
        for (let i = 0; i < frequencyData.length; i += 1) {
          const wave = Math.sin(now + i * 0.32) * 0.5 + 0.5;
          frequencyData[i] = Math.floor(40 + wave * 200);
        }
      }

      const barCount = Math.max(12, Math.min(80, frequencyData.length));
      const barWidth = width / barCount;
      for (let i = 0; i < barCount; i += 1) {
        const index = Math.floor((i / barCount) * frequencyData.length);
        const magnitude = frequencyData[index] / 255;
        const barHeight = Math.max(2, magnitude * (height - 16));
        const x = i * barWidth + 1;
        const y = height - barHeight - 4;
        const color = `hsla(${200 - magnitude * 140}, 90%, ${45 + magnitude * 25}%, 0.92)`;
        context.fillStyle = color;
        context.fillRect(x, y, Math.max(2, barWidth - 2), barHeight);
      }

      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [audioPlaybackEngine]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} className="w-full h-full rounded-2xl border border-slate-700/40 bg-slate-950/70" />
    </div>
  );
};

export default NativeVisualizer;
