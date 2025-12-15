import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../services/audioEngine';

interface VisualizerProps {
  isPlaying: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayheadUpdate: (time: number) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, currentTime, onSeek, onPlayheadUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Scale canvas for retina/high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Set rendering quality
    ctx.imageSmoothingEnabled = false; // Crisp pixels

    const analyser = audioEngine.getAnalyserNode();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      // Clear with solid background (no blur)
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (isPlaying) {
          analyser.getByteFrequencyData(dataArray);
          const barWidth = (rect.width / bufferLength) * 2.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i];
            const r = 34 + (barHeight * 0.5);
            const g = 211 - (barHeight * 0.2);
            const b = 238;

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            const scaledHeight = (barHeight / 255) * rect.height;

            if (scaledHeight > 0) {
                ctx.beginPath();
                ctx.roundRect(x, rect.height - scaledHeight, barWidth, scaledHeight, [4, 4, 0, 0]);
                ctx.fill();
            }
            x += barWidth + 2;
          }
      } else {
          ctx.clearRect(0, 0, rect.width, rect.height);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, rect.width, rect.height);
          ctx.beginPath();
          ctx.moveTo(0, rect.height / 2);
          ctx.lineTo(rect.width, rect.height / 2);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      const duration = audioEngine.getDuration();
      if (duration > 0 && currentTime >= 0) {
        const playheadX = (currentTime / duration) * rect.width;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, rect.height);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, currentTime]);

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

  return (
    <div className="space-y-3">
      <div className="w-full h-64 bg-slate-900 rounded-3xl p-1 shadow-[6px_6px_12px_#090e1a,-6px_-6px_12px_#15203a]" style={{ minHeight: '256px' }}>
        <div className="w-full h-full rounded-[20px] overflow-hidden relative shadow-[inset_4px_4px_8px_#090e1a,inset_-4px_-4px_8px_#15203a] bg-slate-900 group" style={{ minHeight: '100%' }}>
          <div className="absolute top-3 left-4 text-[10px] text-slate-500 font-bold tracking-widest opacity-50 pointer-events-none">
            AUDIO SPECTRUM
          </div>
          {hoverTime && hoverX !== null && (
            <div
              className="absolute top-8 bg-slate-800 text-orange-500 text-[10px] font-bold px-2 py-1 rounded pointer-events-none shadow-lg z-10"
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

      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-4 bg-slate-900 rounded-2xl shadow-[6px_6px_12px_#090e1a,-6px_-6px_12px_#15203a] border border-slate-800/50">
        <button
          onClick={() => audioEngine.skipBackward(10)}
          className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Rewind 10s (Shift+←)"
        >
          <svg className="w-5 h-5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
        </button>
        <button
          onClick={() => audioEngine.skipBackward(5)}
          className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Rewind 5s (←)"
        >
          <svg className="w-5 h-5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="px-4 py-2 bg-slate-800/50 rounded-xl text-xs text-orange-400 font-mono font-bold min-w-[100px] text-center border border-slate-700/50">
          {currentMins}:{currentSecs} / {totalMins}:{totalSecs}
        </div>
        <button
          onClick={() => audioEngine.skipForward(5)}
          className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Forward 5s (→)"
        >
          <svg className="w-5 h-5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => audioEngine.skipForward(10)}
          className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 group shadow-[inset_2px_2px_4px_#090e1a,inset_-2px_-2px_4px_#15203a]"
          title="Forward 10s (Shift+→)"
        >
          <svg className="w-5 h-5 text-slate-300 group-hover:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Visualizer;