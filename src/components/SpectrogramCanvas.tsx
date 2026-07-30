/**
 * SPECTROGRAM CANVAS COMPONENT
 *
 * Sprint 2: Eyes (Synesthesia)
 * Real-time waterfall spectrogram visualization
 *
 * Features:
 * - Real-time frequency domain display
 * - Waterfall effect (time scrolls down)
 * - dB color mapping (blue → green → yellow → red)
 * - Interactive frequency range selection
 * - Playhead synchronization
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SpectrogramFrame, fftAnalyzer } from '../services/fftAnalyzer';

interface SpectrogramCanvasProps {
  analyser?: AnalyserNode;
  sampleRate?: number;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  height?: number;
  freqMin?: number;
  freqMax?: number;
  colorScheme?: 'viridis' | 'hot' | 'cool' | 'turbo';
  showGrid?: boolean;
  interactive?: boolean;
}

/**
 * Color mapping functions for spectrogram
 */
const colorSchemes = {
  viridis: (value: number): [number, number, number] => {
    // Viridis: purple → green → yellow
    const v = Math.max(0, Math.min(1, value));
    if (v < 0.25) {
      return [
        Math.floor(68 + (58 - 68) * (v / 0.25)),
        Math.floor(1 + (71 - 1) * (v / 0.25)),
        Math.floor(84 + (54 - 84) * (v / 0.25)),
      ];
    } else if (v < 0.5) {
      return [
        Math.floor(58 + (34 - 58) * ((v - 0.25) / 0.25)),
        Math.floor(71 + (111 - 71) * ((v - 0.25) / 0.25)),
        Math.floor(54 + (142 - 54) * ((v - 0.25) / 0.25)),
      ];
    } else if (v < 0.75) {
      return [
        Math.floor(34 + (56 - 34) * ((v - 0.5) / 0.25)),
        Math.floor(111 + (188 - 111) * ((v - 0.5) / 0.25)),
        Math.floor(142 + (115 - 142) * ((v - 0.5) / 0.25)),
      ];
    } else {
      return [
        Math.floor(56 + (253 - 56) * ((v - 0.75) / 0.25)),
        Math.floor(188 + (231 - 188) * ((v - 0.75) / 0.25)),
        Math.floor(115 + (37 - 115) * ((v - 0.75) / 0.25)),
      ];
    }
  },

  hot: (value: number): [number, number, number] => {
    // Hot: black → red → yellow → white
    const v = Math.max(0, Math.min(1, value));
    if (v < 0.33) {
      return [Math.floor((v / 0.33) * 255), 0, 0];
    } else if (v < 0.67) {
      return [255, Math.floor(((v - 0.33) / 0.34) * 255), 0];
    } else {
      return [255, 255, Math.floor(((v - 0.67) / 0.33) * 255)];
    }
  },

  cool: (value: number): [number, number, number] => {
    // Cool: blue → cyan → green
    const v = Math.max(0, Math.min(1, value));
    return [
      Math.floor((1 - v) * 0 + v * 255),    // Red: increases
      Math.floor((1 - v) * 255),             // Green: stays
      Math.floor(255),                       // Blue: decreases
    ];
  },

  turbo: (value: number): [number, number, number] => {
    // Turbo: blue → cyan → green → yellow → red
    const v = Math.max(0, Math.min(1, value));
    let r, g, b;

    if (v < 0.5) {
      const t = v * 2;
      r = Math.floor(34 + (0 - 34) * t + (234 - 34) * (t * t));
      g = Math.floor(139 + (179 - 139) * t);
      b = Math.floor(244 + (246 - 244) * t);
    } else {
      const t = (v - 0.5) * 2;
      r = Math.floor(234 + (255 - 234) * t);
      g = Math.floor(179 + (238 - 179) * t);
      b = Math.floor(246 + (0 - 246) * t);
    }

    return [r, g, b];
  },
};

/**
 * SpectrogramCanvas Component
 *
 * Displays frequency content over time in waterfall view.
 * Accumulates FFT frames and scrolls them vertically.
 */
export const SpectrogramCanvas: React.FC<SpectrogramCanvasProps> = ({
  analyser,
  sampleRate = 44100,
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  height = 200,
  freqMin = 20,
  freqMax = 20000,
  colorScheme = 'viridis',
  showGrid = true,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(800);
  const [spectrogramData, setSpectrogramData] = useState<SpectrogramFrame[]>([]);
  const [scrollPos, setScrollPos] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const frameCounterRef = useRef<number>(0);

  const colorMap = colorSchemes[colorScheme];

  // Update canvas width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setCanvasWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Capture FFT frames when playing
  useEffect(() => {
    if (!analyser || !isPlaying) return;

    let frameInterval: NodeJS.Timeout;
    frameInterval = setInterval(() => {
      const frame = fftAnalyzer.analyzeFrequencyBins(analyser, sampleRate);

      // Filter to visible frequency range
      const visibleFreqs = frame.frequencies.filter((f) => f >= freqMin && f <= freqMax);
      const visibleMags = frame.magnitudes.slice(
        frame.frequencies.findIndex((f) => f >= freqMin),
        frame.frequencies.findIndex((f) => f > freqMax) || frame.frequencies.length
      );

      if (visibleFreqs.length > 0) {
        const newFrame: SpectrogramFrame = {
          timestamp: Date.now(),
          frequencies: visibleFreqs,
          magnitudes: visibleMags,
          dominantFrequency: frame.dominantFrequency,
        };

        setSpectrogramData((prev) => {
          // Keep last 300 frames (~15 seconds at 20fps)
          const updated = [...prev, newFrame];
          return updated.slice(-300);
        });

        frameCounterRef.current++;
      }
    }, 50); // Capture every 50ms

    return () => clearInterval(frameInterval);
  }, [analyser, isPlaying, sampleRate, freqMin, freqMax]);

  // Draw the spectrogram
  const drawSpectrogram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || spectrogramData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvasWidth;

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid if enabled
    if (showGrid) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;

      // Horizontal grid lines (frequency markers)
      const freqMarkers = [20, 50, 100, 200, 500, 1000, 5000, 10000, 20000];
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';

      freqMarkers.forEach((freq) => {
        if (freq >= freqMin && freq <= freqMax) {
          const y = fftAnalyzer.frequencyToX(freq, height, freqMax - freqMin) +
            ((freq - freqMin) / (freqMax - freqMin)) * height;

          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();

          // Label
          if (freq >= 1000) {
            ctx.fillText(`${(freq / 1000).toFixed(1)}k`, 4, y - 2);
          } else {
            ctx.fillText(`${freq}`, 4, y - 2);
          }
        }
      });

      // Vertical grid lines (time markers)
      if (duration > 0) {
        const timeStep = duration / 10; // Divide into 10 sections
        for (let t = timeStep; t < duration; t += timeStep) {
          const x = (t / duration) * width;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      }
    }

    // Draw spectrogram as horizontal lines (waterfall)
    const frameHeight = Math.max(1, Math.ceil(height / spectrogramData.length));

    spectrogramData.forEach((frame, frameIdx) => {
      const y = frameIdx * frameHeight;

      // Downsample magnitudes to canvas width
      const downsampledMags = fftAnalyzer.downsample(
        frame.frequencies,
        frame.magnitudes,
        width
      ).magnitudes;

      // Find min/max for normalization
      const minMag = Math.min(...frame.magnitudes);
      const maxMag = Math.max(...frame.magnitudes);
      const magRange = maxMag - minMag || 1;

      // Draw each frequency bin
      for (let x = 0; x < Math.min(width, downsampledMags.length); x++) {
        const mag = downsampledMags[x];
        const normalized = (mag - minMag) / magRange;
        const [r, g, b] = colorMap(normalized);

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, 1, frameHeight);
      }
    });

    // Draw playhead (if synced to audio time)
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

    // Draw frequency axis label
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText(`${freqMin}Hz`, 4, height - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${freqMax}Hz`, width - 4, height - 4);
  }, [spectrogramData, canvasWidth, height, freqMin, freqMax, currentTime, duration, showGrid, colorMap]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      drawSpectrogram();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawSpectrogram]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900/30"
      style={{ height: `${height + 20}px` }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={height}
        style={{
          display: 'block',
          width: '100%',
          height: height,
        }}
        title={`Spectrogram • ${spectrogramData.length} frames • ${colorScheme}`}
      />
      <div className="px-2 py-1 text-xs text-slate-500 flex justify-between">
        <span>Spectrogram ({colorScheme})</span>
        <span>{spectrogramData.length} frames • {frameCounterRef.current} total</span>
      </div>
    </div>
  );
};

export default SpectrogramCanvas;
