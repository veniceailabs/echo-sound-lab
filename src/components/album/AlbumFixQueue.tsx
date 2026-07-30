import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlbumTrackMeta } from '../AlbumSequencerPanel';

interface AlbumFixQueueProps {
  tracks: AlbumTrackMeta[];
  onProceed: () => void;
  onGoBack: () => void;
}

export const AlbumFixQueue: React.FC<AlbumFixQueueProps> = ({ tracks, onProceed, onGoBack }) => {
  const [analyzing, setAnalyzing] = useState(true);
  const [issues, setIssues] = useState<{trackId: string; type: string; message: string; severity: 'high'|'medium'|'low'}[]>([]);

  React.useEffect(() => {
    // Simulate Authority Engine checking for cohesion
    const timer = setTimeout(() => {
      const mockIssues = tracks.length > 2 ? [
        {
          trackId: tracks[1].id,
          type: 'Loudness Delta',
          message: 'This track sits 3LU higher than the album average anchor.',
          severity: 'medium' as const
        },
        {
          trackId: tracks[0].id,
          type: 'Phase Correlation',
          message: 'Wide stereo phase detected in chorus might collapse to mono poorly.',
          severity: 'low' as const
        }
      ] : [];
      setIssues(mockIssues);
      setAnalyzing(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [tracks]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-5xl mx-auto mt-12 px-6"
    >
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Album Authority Review</h2>
          <p className="text-sm text-slate-400 mt-3 font-medium">Checking sequence transitions, relative loudness, and phase cohesion.</p>
        </div>
        <div className="flex gap-4">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onGoBack} 
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-sm font-bold tracking-wide text-white/80 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
          >
            Back to Sequencer
          </motion.button>
          <motion.button 
            whileHover={!analyzing ? { scale: 1.05, boxShadow: "0 0 30px rgba(249,115,22,0.4), inset 0 1px 1px rgba(255,255,255,0.3)" } : {}}
            whileTap={!analyzing ? { scale: 0.95 } : {}}
            onClick={onProceed} 
            disabled={analyzing}
            className="px-6 py-2.5 bg-gradient-to-br from-orange-500 to-orange-600 disabled:from-orange-500/30 disabled:to-orange-600/30 disabled:text-white/40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold tracking-wide transition-all shadow-[0_0_20px_rgba(249,115,22,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)]"
          >
            {analyzing ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Analyzing...
              </span>
            ) : 'Approve & Render'}
          </motion.button>
        </div>
      </div>

      {analyzing ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          className="relative bg-gradient-to-br from-[#12141a]/80 to-[#0a0c10]/90 backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] p-16 text-center shadow-[0_24px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden"
        >
          {/* Scanning radar effect background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.05)_0%,transparent_70%)] animate-pulse" />
          
          <div className="relative z-10">
            <div className="relative w-24 h-24 mx-auto mb-8">
              {/* Outer rings */}
              <div className="absolute inset-0 border-2 border-orange-500/10 rounded-full animate-[ping_3s_ease-in-out_infinite]" />
              <div className="absolute inset-2 border-2 border-orange-500/20 rounded-full animate-spin" style={{ animationDuration: '3s' }} />
              {/* Inner spinner */}
              <div className="absolute inset-4 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" style={{ animationDuration: '1s' }} />
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">Analyzing Cohesion</h3>
            <p className="text-orange-200/50 mt-3 font-mono text-xs uppercase tracking-widest">Running true-peak and ReplayGain simulations...</p>
          </div>
        </motion.div>
      ) : issues.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="relative bg-gradient-to-br from-[#064e3b]/40 to-[#022c22]/60 backdrop-blur-3xl border border-emerald-500/30 rounded-[2rem] p-16 text-center shadow-[0_32px_100px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.2),0_0_80px_rgba(16,185,129,0.1)] overflow-hidden"
        >
          {/* Success Bloom */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/20 blur-[100px] pointer-events-none rounded-full" />
          
          <div className="relative z-10">
            <motion.div 
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(52,211,153,0.5),inset_0_2px_4px_rgba(255,255,255,0.4)]"
            >
              <svg className="w-12 h-12 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-100 to-emerald-300 tracking-tight">Album Cohesion Verified</h3>
            <p className="text-emerald-200/70 mt-4 text-sm font-medium">All tracks are dynamically aligned and phase coherent.<br/>Ready for master generation.</p>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="bg-gradient-to-r from-orange-500/20 to-orange-500/5 border border-orange-500/30 rounded-2xl p-6 mb-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <h3 className="text-orange-300 font-bold mb-2 flex items-center gap-3 text-lg">
              <div className="p-1.5 bg-orange-500/20 rounded-lg">
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              Adjustments Recommended
            </h3>
            <p className="text-orange-200/70 text-sm font-medium ml-11">The authority engine suggests these non-destructive tweaks before finalizing the DDP image.</p>
          </div>

          <div className="grid gap-4">
            {issues.map((issue, idx) => {
              const track = tracks.find(t => t.id === issue.trackId);
              return (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + (idx * 0.1) }}
                  key={idx} 
                  className="bg-gradient-to-br from-[#1c1f26]/80 to-[#12141a]/90 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] rounded-2xl p-6 flex items-start gap-5 hover:border-white/20 transition-all duration-300 group"
                >
                  <div className={`p-3 rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] ${issue.severity === 'high' ? 'bg-red-500/20 border border-red-500/30 text-red-400' : issue.severity === 'medium' ? 'bg-orange-500/20 border border-orange-500/30 text-orange-400' : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'}`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-100 text-lg flex items-center gap-3">
                        {track?.title || 'Unknown Track'} 
                        <span className="text-[10px] font-mono text-white/50 uppercase px-2.5 py-1 bg-black/40 border border-white/10 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">{issue.type}</span>
                      </h4>
                      <button className="text-xs bg-white/5 hover:bg-white/15 border border-white/10 text-white px-4 py-2 rounded-lg font-bold tracking-wide transition-all shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:shadow-[0_4px_15px_rgba(255,255,255,0.05)] active:scale-95">
                        Auto-Fix
                      </button>
                    </div>
                    <p className="text-sm text-slate-400 mt-2 font-medium">{issue.message}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
