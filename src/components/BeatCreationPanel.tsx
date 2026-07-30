/**
 * BeatCreationPanel â€Beat/loop creation interface
 *
 * Users can:
 * 1. Browse loop library (filtered by genre/BPM)
 * 2. Drag loops onto timeline
 * 3. Adjust volume/pan per loop
 * 4. Set project BPM + key
 * 5. Export beat as stereo bounce or stems
 * 6. Load the beat into MixCombiner with vocal
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  beatCreationService,
  type BeatProject,
  type LoopSample,
  SAMPLE_LOOPS,
} from '../services/beatCreationService';

interface BeatCreationPanelProps {
  vocalBpm?: number;
  onBeatCreated?: (beatFile: File) => void;
}

type Tab = 'loops' | 'mixer' | 'export';

export const BeatCreationPanel: React.FC<BeatCreationPanelProps> = ({ vocalBpm = 95, onBeatCreated }) => {
  const [project, setProject] = useState<BeatProject | null>(null);
  const [tab, setTab] = useState<Tab>('loops');
  const [selectedGenre, setSelectedGenre] = useState<string>('hip-hop');
  const [filterBpm, setFilterBpm] = useState<number>(vocalBpm);

  const [exportProgress, setExportProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const createNewBeat = useCallback(() => {
    const newProject = beatCreationService.createProject(`Beat ${Date.now()}`, filterBpm, 'C');
    setProject(newProject);
    setTab('mixer');
  }, [filterBpm]);

  const getFilteredLoops = useCallback(() => {
    return beatCreationService.getLoops({
      genre: selectedGenre as any,
      bpm: filterBpm,
    });
  }, [selectedGenre, filterBpm]);

  const addLoopToProject = useCallback(
    (loopId: string) => {
      if (!project) return;
      const newProject = beatCreationService.addLoop(project, loopId, project.loops.length);
      setProject(newProject);
    },
    [project]
  );

  const updateLoopInProject = useCallback(
    (loopTrackId: string, updates: { volume?: number; pan?: number; muted?: boolean }) => {
      if (!project) return;
      const newProject = beatCreationService.updateLoop(project, loopTrackId, updates);
      setProject(newProject);
    },
    [project]
  );

  const handleExport = useCallback(async () => {
    if (!project) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      setExportProgress(50);

      const beatBlob = await beatCreationService.exportBeat(project);
      setExportProgress(90);

      const beatFile = new File([beatBlob], `${project.name}.wav`, { type: 'audio/wav' });
      onBeatCreated?.(beatFile);

      setExportProgress(100);
    } finally {
      setIsExporting(false);
    }
  }, [project, onBeatCreated]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <h2 className="text-lg font-semibold text-white">Beat Creation Studio</h2>
        <p className="text-xs text-white/40 mt-1">
          Build backing tracks with loops, sync to your vocal BPM ({vocalBpm} BPM)
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-white/[0.08] flex gap-2">
        {(['loops', 'mixer', 'export'] as const).map((t) => (
          <motion.button
            key={t}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTab(t)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${
                tab === t
                  ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                  : 'bg-white/[0.04] border border-white/10 text-white/60 hover:bg-white/[0.08]'
              }
            `}
          >
            {t === 'loops' ? 'ðŸ“Loop Library' : t === 'mixer' ? 'ðŸŽšï¸Mixer' : 'â¬‡ï¸Export'}
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {/* No project state */}
        {!project && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70 block mb-2">Target BPM</label>
              <input
                type="number"
                min="60"
                max="200"
                value={filterBpm}
                onChange={(e) => setFilterBpm(parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={createNewBeat}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 font-medium hover:bg-blue-500/30 transition-colors"
            >
              âœCreate New Beat
            </motion.button>
          </div>
        )}

        {/* Loops tab */}
        {project && tab === 'loops' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {['hip-hop', 'trap', 'rnb', 'pop'].map((genre) => (
                <motion.button
                  key={genre}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedGenre(genre)}
                  className={`
                    px-3 py-2 rounded-lg text-xs font-medium transition-all border
                    ${
                      selectedGenre === genre
                        ? 'border-purple-500/50 bg-purple-500/20 text-purple-300'
                        : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
                    }
                  `}
                >
                  {genre.toUpperCase()}
                </motion.button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {getFilteredLoops().map((loop) => (
                <motion.div
                  key={loop.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => addLoopToProject(loop.id)}
                  className="p-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer transition-all"
                >
                  <p className="text-xs font-medium text-white truncate">{loop.name}</p>
                  <p className="text-[10px] text-white/40 mt-1">{loop.bpm} BPM â€{loop.duration}s</p>
                  <p className="text-[10px] text-white/30 mt-1">{loop.category}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Mixer tab */}
        {project && tab === 'mixer' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/10">
              <div>
                <p className="text-xs font-medium text-white">{project.name}</p>
                <p className="text-[10px] text-white/40">{project.bpm} BPM â€{project.key}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setProject(null)}
                className="px-3 py-1 rounded text-xs bg-white/10 text-white/60 hover:bg-white/15 transition-colors"
              >
                New
              </motion.button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {project.loops.length === 0 ? (
                <p className="text-xs text-white/40 py-8 text-center">Click loops to add them to your beat</p>
              ) : (
                project.loops.map((track, idx) => {
                  const loop = SAMPLE_LOOPS.find((l) => l.id === track.loopId);
                  if (!loop) return null;

                  return (
                    <div key={track.id} className="p-3 rounded-lg border border-white/10 bg-white/[0.04]">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={!track.muted}
                          onChange={(e) => updateLoopInProject(track.id, { muted: !e.target.checked })}
                          className="w-4 h-4"
                        />
                        <p className="text-xs font-medium text-white flex-1">{loop.name}</p>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => {
                            const newProject = {
                              ...project,
                              loops: project.loops.filter((l) => l.id !== track.id),
                            };
                            setProject(newProject);
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          âœ•
                        </motion.button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-white/60">Volume: {Math.round(track.volume * 100)}%</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={track.volume}
                            onChange={(e) => updateLoopInProject(track.id, { volume: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/20 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/60">Pan</label>
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.1"
                            value={track.pan}
                            onChange={(e) => updateLoopInProject(track.id, { pan: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-white/20 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Export tab */}
        {project && tab === 'export' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-white/[0.06] border border-white/10">
              <p className="text-xs font-medium text-white mb-2">Ready to export</p>
              <p className="text-[10px] text-white/60">
                {project.loops.length} loops â€{project.bpm} BPM
              </p>
            </div>

            {!isExporting ? (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleExport}
                className="w-full px-4 py-2.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 font-medium hover:bg-green-500/30 transition-colors"
              >
                â¬‡ï¸Export Beat as WAV
              </motion.button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-amber-300">Exporting...</p>
                  <p className="text-xs text-amber-400">{exportProgress}%</p>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${exportProgress}%` }}
                    className="h-full rounded-full bg-amber-400"
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            <p className="text-[10px] text-white/40">
              ðŸ’Tip: Export your beat, then drop it into Mix Combiner with your vocal to create the final master.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default BeatCreationPanel;
