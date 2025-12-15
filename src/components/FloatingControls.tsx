import React from 'react';

const blinkStyle = `
  @keyframes blink {
    0%, 100% { opacity: 0.3; border-color: rgb(251, 146, 60 / 0.1); }
    50% { opacity: 1; border-color: rgb(251, 146, 60); }
  }
`;

interface FloatingControlsProps {
  isPlaying: boolean;
  onTogglePlayback: () => void;
  currentTime: number;
  duration: number;
  isAbComparing: boolean;
  onToggleAB: () => void;
  hasAppliedChanges: boolean;
  onSeek?: (time: number) => void;
}

export const FloatingControls: React.FC<FloatingControlsProps> = ({
  isPlaying,
  onTogglePlayback,
  currentTime,
  duration,
  isAbComparing,
  onToggleAB,
  hasAppliedChanges,
  onSeek
}) => {
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleRewind = () => {
    if (!onSeek) return;
    const newTime = Math.max(0, currentTime - 10);
    onSeek(newTime);
  };

  const handleFastForward = () => {
    if (!onSeek) return;
    const newTime = Math.min(duration, currentTime + 10);
    onSeek(newTime);
  };

  return (
    <>
      <style>{blinkStyle}</style>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-10 fade-in duration-500">

      {/* Time Display */}
      <div className="font-mono text-xs text-slate-400 min-w-[80px] text-center hidden sm:block">
        <span className="text-white">{formatTime(currentTime)}</span> / {formatTime(duration)}
      </div>

      {/* Rewind Button */}
      <button
        onClick={handleRewind}
        className="w-9 h-9 flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-full transition-all hover:scale-105 active:scale-95"
        title="Rewind 10s"
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          <text x="9" y="16" fontSize="8" fill="currentColor" fontWeight="bold">10</text>
        </svg>
      </button>

      {/* Play/Pause Main Button - System Transport Control */}
      <button
        onClick={onTogglePlayback}
        className="relative w-14 h-14 flex items-center justify-center group"
      >
        {/* Halo Ring - Blinks when playing */}
        <div className={`absolute inset-0 rounded-full border border-[#FB923C]/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_-1px_1px_rgba(255,255,255,0.08)] transition-all duration-500 ${
          isPlaying
            ? 'animate-[blink_3s_infinite]'
            : ''
        }`} />

        {/* Core Button */}
        <div className="absolute inset-2 rounded-full bg-[#FB923C] shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(255,255,255,0.2)] group-hover:bg-[#FFA855] group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_3px_rgba(0,0,0,0.15),inset_0_-1px_2px_rgba(255,255,255,0.1)] group-hover:scale-[0.98] group-active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)] group-active:scale-95 transition-all duration-150 ease-out" />

        {/* Icon - Morphs between play and pause */}
        {isPlaying ? (
          <svg className="w-5 h-5 fill-slate-900/90 relative z-10 transition-all duration-300" viewBox="0 0 24 24">
            <rect x="7" y="5" width="3" height="14" rx="1.5" />
            <rect x="14" y="5" width="3" height="14" rx="1.5" />
          </svg>
        ) : (
          <svg className="w-5 h-5 fill-slate-900/90 relative z-10 transition-all duration-300" viewBox="0 0 24 24">
            <path d="M9 6.5v11l9-5.5z" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Fast Forward Button */}
      <button
        onClick={handleFastForward}
        className="w-9 h-9 flex items-center justify-center bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-full transition-all hover:scale-105 active:scale-95"
        title="Fast Forward 10s"
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M12 1v4l5-5-5-5v4c-4.42 0-8 3.58-8 8h2c0-3.31 2.69-6 6-6zm6 12c0 3.31-2.69 6-6 6s-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8h-2z" transform="translate(0, 6)"/>
          <text x="9" y="16" fontSize="8" fill="currentColor" fontWeight="bold">10</text>
        </svg>
      </button>

      {/* A/B Toggle */}
      <div className="h-8 w-px bg-white/10 mx-2" />
      
      <button
        onClick={onToggleAB}
        disabled={!hasAppliedChanges}
        className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
          !hasAppliedChanges
            ? 'text-slate-600 cursor-not-allowed'
            : isAbComparing
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
              : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/50'
        }`}
      >
        {isAbComparing ? 'Original' : 'Processed'}
      </button>
    </div>
    </>
  );
};