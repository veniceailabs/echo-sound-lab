import React, { useState } from 'react';
import { motion, Reorder } from 'framer-motion';

export interface AlbumTrackMeta {
  id: string;
  file: File;
  title: string;
  artist: string;
  isrc: string;
  gapSeconds: number; // Gap AFTER this track
}

interface AlbumSequencerPanelProps {
  tracks: AlbumTrackMeta[];
  onTracksChange: (tracks: AlbumTrackMeta[]) => void;
  onClose: () => void;
  onProceed: () => void;
}

export const AlbumSequencerPanel: React.FC<AlbumSequencerPanelProps> = ({
  tracks,
  onTracksChange,
  onClose,
  onProceed
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateTrack = (id: string, updates: Partial<AlbumTrackMeta>) => {
    onTracksChange(tracks.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#0a0c12]/80 backdrop-blur-[40px]"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-5xl bg-gradient-to-br from-[#1c1f26]/90 to-[#0a0c10]/95 border border-white/[0.08] rounded-[2rem] shadow-[0_32px_100px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.15)] overflow-hidden flex flex-col max-h-[85vh] relative"
      >
        {/* Ambient top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-cyan-500/10 blur-[80px] pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-8 py-7 border-b border-white/[0.05] bg-white/[0.01]">
          <div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 tracking-tight">Album Sequencer</h2>
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-white/40 mt-2">Arrange tracks • Define transitions • Finalize Metadata</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto p-8">
          {tracks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/30 text-sm">
              No tracks loaded. Drop files to begin.
            </div>
          ) : (
            <Reorder.Group axis="y" values={tracks} onReorder={onTracksChange} className="space-y-3">
              {tracks.map((track, index) => (
                <Reorder.Item
                  key={track.id}
                  value={track}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative bg-[#12141a]/60 backdrop-blur-xl border border-white/[0.04] rounded-2xl p-4 sm:p-5 flex flex-col gap-4 cursor-grab active:cursor-grabbing hover:bg-white/[0.06] hover:border-white/[0.08] hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300"
                >
                  <div className="flex items-center gap-3 sm:gap-5">
                    {/* Drag Handle */}
                    <div className="text-white/20 group-hover:text-white/50 transition-colors">
                      <svg width="12" height="24" viewBox="0 0 12 24" fill="currentColor">
                        <circle cx="4" cy="6" r="1.5" />
                        <circle cx="8" cy="6" r="1.5" />
                        <circle cx="4" cy="12" r="1.5" />
                        <circle cx="8" cy="12" r="1.5" />
                        <circle cx="4" cy="18" r="1.5" />
                        <circle cx="8" cy="18" r="1.5" />
                      </svg>
                    </div>

                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-[0.8rem] bg-black/60 flex items-center justify-center text-xs sm:text-sm font-bold text-white border border-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] group-hover:border-cyan-500/30 group-hover:bg-cyan-500/10 group-hover:text-cyan-300 transition-colors">
                      {index + 1}
                    </div>
                    
                    <div className="flex-1 grid grid-cols-12 gap-3 sm:gap-5">
                      <div className="col-span-12 sm:col-span-4">
                        <label className="block text-[9px] uppercase tracking-[0.15em] text-white/40 mb-1.5 font-bold">Title</label>
                        <input
                          type="text"
                          value={track.title}
                          onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                          className="w-full bg-[#0a0c10] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-white/5 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-cyan-500/40 focus:bg-cyan-500/5 focus:shadow-[0_0_15px_rgba(6,182,212,0.1),inset_0_2px_4px_rgba(0,0,0,0.6)] transition-all"
                          placeholder="Track Title"
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3">
                        <label className="block text-[9px] uppercase tracking-[0.15em] text-white/40 mb-1.5 font-bold">Artist</label>
                        <input
                          type="text"
                          value={track.artist}
                          onChange={(e) => updateTrack(track.id, { artist: e.target.value })}
                          className="w-full bg-[#0a0c10] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-white/5 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-cyan-500/40 focus:bg-cyan-500/5 transition-all"
                          placeholder="Artist Name"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <label className="block text-[9px] uppercase tracking-[0.15em] text-white/40 mb-1.5 font-bold">ISRC</label>
                        <input
                          type="text"
                          value={track.isrc}
                          onChange={(e) => updateTrack(track.id, { isrc: e.target.value })}
                          className="w-full bg-[#0a0c10] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-white/5 rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-cyan-500/40 focus:bg-cyan-500/5 transition-all font-mono tracking-wider"
                          placeholder="US-XXX..."
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-2 relative">
                        <label className="block text-[9px] uppercase tracking-[0.15em] text-white/40 mb-1.5 font-bold">Gap</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={track.gapSeconds}
                            onChange={(e) => updateTrack(track.id, { gapSeconds: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-[#0a0c10] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-white/5 rounded-xl pl-3 pr-8 py-2 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-500/40 focus:bg-cyan-500/5 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/30">s</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => onTracksChange(tracks.filter(t => t.id !== track.id))}
                      className="p-2.5 rounded-xl hover:bg-red-500/20 text-white/20 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all ml-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/[0.05] bg-[#0a0c10]/80 backdrop-blur-md flex justify-between items-center relative z-10">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            Total Tracks: <span className="text-white ml-1">{tracks.length}</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onProceed}
            disabled={tracks.length === 0}
            className="px-8 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/50 text-cyan-300 font-bold text-xs uppercase tracking-widest hover:bg-cyan-500/20 hover:shadow-[0_0_30px_rgba(6,182,212,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Run Cohesion Analysis
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};
