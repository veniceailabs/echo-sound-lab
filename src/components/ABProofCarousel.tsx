import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ABProofCarouselProps {
  originalWaveform: number[];
  processedWaveform: number[];
  originalBuffer: AudioBuffer;
  processedBuffer: AudioBuffer;
  width?: number;
  height?: number;
}

export const ABProofCarousel: React.FC<ABProofCarouselProps> = ({
  originalWaveform,
  processedWaveform,
  originalBuffer,
  processedBuffer,
  width = 400,
  height = 100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Draw waveform diff
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // Clear
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const len = Math.min(originalWaveform.length, processedWaveform.length);
    const pixelWidth = width / len;

    // Draw original waveform (ghost/gray)
    ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
    for (let i = 0; i < len; i++) {
      const x = i * pixelWidth;
      const peak = originalWaveform[i];
      const barHeight = peak * (height / 2);
      ctx.fillRect(x, height / 2 - barHeight / 2, pixelWidth, barHeight);
    }

    // Draw processed waveform (cyan, opaque)
    ctx.fillStyle = 'rgba(34, 211, 238, 0.7)';
    for (let i = 0; i < len; i++) {
      const x = i * pixelWidth;
      const peak = processedWaveform[i];
      const barHeight = peak * (height / 2);
      ctx.fillRect(x, height / 2 - barHeight / 2, pixelWidth, barHeight);
    }

    // Draw scrubber line
    const scrubX = (scrubPosition / 100) * width;
    ctx.strokeStyle = 'rgba(251, 146, 60, 1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scrubX, 0);
    ctx.lineTo(scrubX, height);
    ctx.stroke();

    // Draw scrubber circle
    ctx.fillStyle = 'rgba(251, 146, 60, 1)';
    ctx.beginPath();
    ctx.arc(scrubX, height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [scrubPosition, originalWaveform, processedWaveform, width, height]);

  const handleScrub = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setScrubPosition(percent);

    // Play audio at this position
    playAtPosition(percent);
  };

  const playAtPosition = (percentPos: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContextRef.current;
    const startTime = (percentPos / 100) * originalBuffer.duration;
    const duration = 0.5; // Play 500ms from this point

    // Stop any currently playing audio
    ctx.stopAllAudio?.();

    // Play original and processed simultaneously
    const originalSource = ctx.createBufferSource();
    originalSource.buffer = originalBuffer;
    const originalGain = ctx.createGain();
    originalGain.gain.value = 0.4;
    originalSource.connect(originalGain);
    originalGain.connect(ctx.destination);
    originalSource.start(ctx.currentTime, startTime, duration);

    const processedSource = ctx.createBufferSource();
    processedSource.buffer = processedBuffer;
    const processedGain = ctx.createGain();
    processedGain.gain.value = 0.4;
    processedSource.connect(processedGain);
    processedGain.connect(ctx.destination);
    processedSource.start(ctx.currentTime, startTime, duration);
  };

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div className="flex items-center gap-2">
        <h4 className="text-xs uppercase tracking-widest text-slate-400">
          A/B Scrubber â€Click to compare original vs. processed
        </h4>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          onClick={handleScrub}
          className="w-full border border-white/10 rounded-lg cursor-pointer hover:border-orange-400/50 transition-colors bg-slate-950"
          style={{ height: '120px' }}
          aria-label="A/B waveform comparison scrubber"
        />
        <div className="text-xs text-slate-500 mt-2 flex justify-between">
          <span>Gray = Original | Cyan = Mastered</span>
          <span>{Math.round(scrubPosition)}%</span>
        </div>
      </div>

      <motion.div
        className="p-3 rounded-lg bg-blue-500/10 border border-blue-400/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <p className="text-xs text-blue-300 text-center">
          ðŸ’Drag across to hear the difference. Both tracks play at the same point.
        </p>
      </motion.div>
    </motion.div>
  );
};
