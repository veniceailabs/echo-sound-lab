/**
 * WAVEFORM CANVAS COMPONENT
 *
 * Sprint 2: Eyes (Synesthesia)
 * Real-time waveform visualization using HTML5 Canvas
 *
 * Features:
 * - Real-time waveform rendering (60fps)
 * - Playhead synchronization
 * - Zoom and pan controls
 * - Peak envelope display
 * - RMS level visualization
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WaveformData } from '../services/fftAnalyzer';

interface WaveformCanvasProps {
  audioBuffer?: AudioBuffer;
  waveformData?: WaveformData;
  currentTime?: number; // Current playback position in seconds
  duration?: number;     // Total duration in seconds
  onSeek?: (timeSeconds: number) => void;
  colors?: {
    background: string;
    waveform: string;
    peaks: string;
    playhead: string;
    grid: string;
  };
  height?: number;
  showGrid?: boolean;
  showPeaks?: boolean;
  interactive?: boolean;
}

const DEFAULT_COLORS = {
  background: '#0f172a',
  waveform: '#3b82f6',
  peaks: '#f97316',
  playhead: '#ef4444',
  grid: '#1e293b',
};

/**
 * WaveformCanvas Component
 *
 * Displays a scrolling/fixed waveform with real-time playhead.
 * Uses canvas for high performance with 2000+ sample points.
 */
export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  audioBuffer,
  waveformData,
  currentTime = 0,
  duration = 0,
  onSeek,
  colors = DEFAULT_COLORS,
  height = 120,
  showGrid = true,
  showPeaks = true,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(800);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate samples from either audioBuffer or pre-computed waveformData
  const [samples, setSamples] = useState<number[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    if (waveformData) {
      setSamples(waveformData.samples);
      setPeaks(waveformData.peaks);
    } else if (audioBuffer) {
      // Extract waveform from buffer (simple downsampling)
      const channelData = audioBuffer.getChannelData(0);
      const samplesPerPixel = Math.max(1, Math.floor(channelData.length / 2000));
      const newSamples: number[] = [];
      const newPeaks: number[] = [];

      for (let i = 0; i < channelData.length; i += samplesPerPixel) {
        const endIndex = Math.min(i + samplesPerPixel, channelData.length);
        let maxPeak = 0;
        let sumValue = 0;

        for (let j = i; j < endIndex; j++) {
          const sample = channelData[j];
          maxPeak = Math.max(maxPeak, Math.abs(sample));
          sumValue += sample;
        }

        newSamples.push(sumValue / samplesPerPixel);
        newPeaks.push(maxPeak);
      }

      setSamples(newSamples);
      setPeaks(newPeaks);
    }
  }, [audioBuffer, waveformData]);

  // Update canvas width on container resize
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

  // Draw the waveform
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || samples.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvasWidth;
    const centerY = height / 2;

    // Clear canvas
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // Draw grid if enabled
    if (showGrid) {
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;

      // Horizontal center line
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Vertical grid lines (every 1 second)
      if (duration > 0) {
        for (let t = 0; t < duration; t += 1) {
          const x = (t / duration) * width;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      }
    }

    // Calculate visible sample range based on zoom
    const totalSamplesToShow = Math.floor(samples.length / zoomLevel);
    const visibleStartSample = scrollOffset;
    const visibleEndSample = Math.min(visibleStartSample + totalSamplesToShow, samples.length);

    const samplesInView = visibleEndSample - visibleStartSample;
    const pixelsPerSample = width / samplesInView;

    // Draw waveform (RMS values)
    ctx.strokeStyle = colors.waveform;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = visibleStartSample; i < visibleEndSample; i++) {
      const sampleValue = samples[i];
      const x = (i - visibleStartSample) * pixelsPerSample;
      const y = centerY - sampleValue * centerY;

      if (i === visibleStartSample) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw peak envelope if enabled
    if (showPeaks && peaks.length > 0) {
      ctx.strokeStyle = colors.peaks;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;

      // Upper envelope
      ctx.beginPath();
      for (let i = visibleStartSample; i < visibleEndSample; i++) {
        const peak = peaks[i] || 0;
        const x = (i - visibleStartSample) * pixelsPerSample;
        const y = centerY - peak * centerY;

        if (i === visibleStartSample) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Lower envelope
      ctx.beginPath();
      for (let i = visibleStartSample; i < visibleEndSample; i++) {
        const peak = peaks[i] || 0;
        const x = (i - visibleStartSample) * pixelsPerSample;
        const y = centerY + peak * centerY;

        if (i === visibleStartSample) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = colors.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Playhead tip
      ctx.fillStyle = colors.playhead;
      ctx.fillRect(playheadX - 3, 0, 6, 6);
    }

    // Draw time labels
    if (duration > 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';

      // Current time
      const currentTimeStr = formatTime(currentTime);
      ctx.fillText(currentTimeStr, 8, height - 6);

      // Total duration
      const durationStr = formatTime(duration);
      ctx.textAlign = 'right';
      ctx.fillText(durationStr, width - 8, height - 6);
    }
  }, [samples, peaks, canvasWidth, height, colors, zoomLevel, scrollOffset, currentTime, duration, showGrid, showPeaks]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      drawWaveform();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawWaveform]);

  // Handle mouse wheel for zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(1, Math.min(10, zoomLevel * zoomFactor));
    setZoomLevel(newZoom);
  };

  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !canvasRef.current || duration === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seekTime = (x / rect.width) * duration;

    onSeek?.(seekTime);
  };

  // Handle drag to pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;

    const startX = e.clientX;
    const startOffset = scrollOffset;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const samplesPerPixel = samples.length / canvasWidth;
      const newOffset = Math.max(0, startOffset - deltaX * samplesPerPixel);
      setScrollOffset(newOffset);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{
          display: 'block',
          cursor: interactive ? 'pointer' : 'default',
          width: '100%',
          height: height,
        }}
        title={`${samples.length} samples • Zoom: ${zoomLevel.toFixed(1)}x • ${interactive ? 'Click to seek, wheel to zoom' : 'Non-interactive'}`}
      />
      <div className="px-2 py-1 text-xs text-slate-500 flex justify-between">
        <span>
          {zoomLevel > 1 ? `Zoomed ${zoomLevel.toFixed(1)}x` : 'Full view'}
        </span>
        <span>{samples.length} samples</span>
      </div>
    </div>
  );
};

/**
 * Format time in mm:ss format
 */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default WaveformCanvas;
