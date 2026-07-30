import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlbumSequencerPanel, AlbumTrackMeta } from '../AlbumSequencerPanel';
import { AlbumFixQueue } from './AlbumFixQueue';
import { albumSnapshotService } from '../../services/album/albumSnapshotService';
import { albumExportService } from '../../services/albumExportService';

interface AlbumModeRouteProps {
  initialFiles: File[];
  onExit: () => void;
}

type AlbumPhase = 'sequencing' | 'authority' | 'fix-queue' | 'exporting';

export const AlbumModeRoute: React.FC<AlbumModeRouteProps> = ({ initialFiles, onExit }) => {
  const [phase, setPhase] = useState<AlbumPhase>('sequencing');
  const [tracks, setTracks] = useState<AlbumTrackMeta[]>([]);

  // Phase 2: Album Snapshot Manager
  const [snapshotId, setSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    // Check if we are resuming an existing snapshot
    const existingSnapshots = albumSnapshotService.getSnapshots();
    // For simplicity, just load first tracks from files
    // In a real flow, we'd check if these files match a saved snapshot
    const initialTracks = initialFiles.map(f => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      title: f.name.replace(/\.[^/.]+$/, ""),
      artist: '',
      isrc: '',
      gapSeconds: 2,
    }));
    setTracks(initialTracks);
  }, [initialFiles]);

  const handleSequenceConfirmed = () => {
    // Save snapshot of sequencing
    const snapId = `album_snap_${Date.now()}`;
    albumSnapshotService.saveSnapshot({
      id: snapId,
      createdAt: Date.now(),
      tracks: tracks.map(t => ({ ...t, file: undefined as any })), // Omit file obj
      projectMeta: { albumTitle: 'My Album', albumArtist: 'Me', upc: '' }
    });
    setSnapshotId(snapId);
    setPhase('fix-queue');
  };

  const handleExport = async () => {
    try {
      // Decode audio files into AudioBuffers for mastering
      const audioCtx = new AudioContext();
      const renderedBuffers = await Promise.all(tracks.map(async (t) => {
        if (!t.file) return audioCtx.createBuffer(2, 44100, 44100); // Empty fallback if file is somehow missing
        const arrayBuf = await t.file.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuf);
      }));

      const zipBlob = await albumExportService.generateDdpPrepZip('ESL Album', 'ESL Artist', tracks, renderedBuffers);
      albumExportService.downloadBlob(zipBlob, 'ESL_Master_DDP_Prep.zip');
      
      // Close AudioContext
      audioCtx.close();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-[#0a0c12] text-white overflow-hidden flex flex-col">
      {/* Top Bar for Album Mode */}
      <div className="flex-shrink-0 h-16 border-b border-white/10 bg-[#12141a]/90 flex items-center justify-between px-6 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Album Mode</h1>
          <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <span className={`text-[10px] uppercase font-bold tracking-wider ${phase === 'sequencing' ? 'text-cyan-400' : 'text-white/40'}`}>1. Sequence</span>
            <span className="text-white/20">›</span>
            <span className={`text-[10px] uppercase font-bold tracking-wider ${phase === 'fix-queue' ? 'text-orange-400' : 'text-white/40'}`}>2. Fix Queue</span>
            <span className="text-white/20">›</span>
            <span className={`text-[10px] uppercase font-bold tracking-wider ${phase === 'exporting' ? 'text-emerald-400' : 'text-white/40'}`}>3. Deliver</span>
          </div>
        </div>
        <button 
          onClick={onExit}
          className="text-sm font-medium text-white/50 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          Exit Album Mode
        </button>
      </div>

      {/* Main Working Area */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {phase === 'sequencing' && (
            <motion.div 
              key="sequencing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="absolute inset-0"
            >
              <AlbumSequencerPanel
                tracks={tracks}
                onTracksChange={setTracks}
                onClose={onExit}
                onProceed={handleSequenceConfirmed}
              />
            </motion.div>
          )}

          {phase === 'fix-queue' && (
            <motion.div 
              key="fix-queue"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="absolute inset-0 overflow-y-auto"
            >
              <AlbumFixQueue
                tracks={tracks}
                onProceed={() => {
                  setPhase('exporting');
                  handleExport();
                }}
                onGoBack={() => setPhase('sequencing')}
              />
            </motion.div>
          )}

          {phase === 'exporting' && (
            <motion.div 
              key="exporting"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="absolute inset-0 p-8 flex flex-col items-center justify-center"
            >
              <div className="max-w-2xl text-center">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </div>
                <h2 className="text-3xl font-bold mb-4 text-emerald-100">Album Exported Successfully</h2>
                <p className="text-emerald-200/60 mb-8">Generated ZIP archive with mastered WAVs, Cue Sheet, and DDP prep folder.</p>
                <button 
                  onClick={onExit}
                  className="px-6 py-3 bg-white text-black font-bold rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105 transition-transform"
                >
                  Return to Studio
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
