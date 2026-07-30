/**
 * DrumMachinePanel â€16-step drum sequencer
 *
 * Features:
 * - Multiple drum kits (acoustic, trap, minimal, 808)
 * - 16-step pattern editor
 * - Real-time playback with BPM sync
 * - Preset pattern library
 * - Export as WAV/stems
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { drumMachineService, type DrumPattern, type DrumKit, type DrumSound } from '../services/drumMachineService';

interface DrumMachinePanelProps {
  vocalBpm?: number;
  onBeatCreated?: (beatFile: File) => void;
}

type Tab = 'kits' | 'sequencer' | 'presets' | 'export';

const DRUM_SOUNDS: DrumSound[] = ['kick', 'snare', 'clap', 'hihat', 'tom', 'perc'];

export const DrumMachinePanel: React.FC<DrumMachinePanelProps> = ({ vocalBpm = 95, onBeatCreated }) => {
  const [tab, setTab] = useState<Tab>('kits');
  const [selectedKit, setSelectedKit] = useState<DrumKit>('trap');
  const [pattern, setPattern] = useState<DrumPattern | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [presets, setPresets] = useState(drumMachineService.getPresets());

  const kits = drumMachineService.getKits();

  const createNewPattern = useCallback(() => {
    const newPattern = drumMachineService.createPattern(`Pattern ${Date.now()}`, selectedKit, vocalBpm);
    setPattern(newPattern);
    setTab('sequencer');
  }, [selectedKit, vocalBpm]);

  const playPattern = useCallback(async () => {
    if (!pattern) return;
    setIsPlaying(true);
    try {
      await drumMachineService.playPattern(pattern);
    } finally {
      setIsPlaying(false);
    }
  }, [pattern]);

  const stopPattern = useCallback(() => {
    drumMachineService.stopPattern();
    setIsPlaying(false);
  }, []);

  const toggleStep = useCallback(
    (stepIndex: number, sound: DrumSound) => {
      if (!pattern) return;

      const step = pattern.steps.find((s) => s.stepIndex === stepIndex);
      if (!step) return;

      const newSounds = { ...step.sounds };
      newSounds[sound] = !newSounds[sound];

      const updatedPattern = drumMachineService.updateStep(pattern, stepIndex, newSounds);
      setPattern(updatedPattern);
    },
    [pattern]
  );

  const playSound = useCallback((sound: DrumSound) => {
    drumMachineService.playSound(sound, selectedKit, 0.8);
  }, [selectedKit]);

  const loadPreset = useCallback((preset: DrumPattern) => {
    setPattern(preset);
    setTab('sequencer');
  }, []);

  const handleExport = useCallback(async () => {
    if (!pattern) return;
    try {
      const wav = await drumMachineService.exportPattern(pattern);
      const beatFile = new File([wav], `${pattern.name}.wav`, { type: 'audio/wav' });
      onBeatCreated?.(beatFile);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [pattern, onBeatCreated]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <h2 className="text-lg font-semibold text-white">ğŸ¥Drum Machine</h2>
        <p className="text-xs text-white/40 mt-1">Create patterns with {kits.length} drum kits</p>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-white/[0.08] flex gap-2 overflow-x-auto">
        {(['kits', 'sequencer', 'presets', 'export'] as const).map((t) => (
          <motion.button
            key={t}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTab(t)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
              ${
                tab === t
                  ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                  : 'bg-white/[0.04] border border-white/10 text-white/60 hover:bg-white/[0.08]'
              }
            `}
          >
            {t === 'kits' ? 'ğŸKits' : t === 'sequencer' ? 'ğŸSequencer' : t === 'presets' ? 'ğŸ“Presets' : 'â¬‡ï¸Export'}
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {/* Kits tab */}
        {tab === 'kits' && (
          <div className="space-y-4">
            <p className="text-xs font-medium text-white/70">Select a drum kit</p>
            <div className="grid grid-cols-2 gap-3">
              {kits.map((kit) => (
                <motion.button
                  key={kit.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setSelectedKit(kit.id);
                    createNewPattern();
                  }}
                  className={`
                    p-4 rounded-lg border transition-all text-center
                    ${
                      selectedKit === kit.id
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                        : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                    }
                  `}
                >
                  <p className="font-semibold text-sm">{kit.name}</p>
                  <p className="text-xs text-white/40 mt-1">
                    {Object.keys(kit.sounds).length} sounds
                  </p>
                </motion.button>
              ))}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={createNewPattern}
              disabled={!pattern}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 font-medium hover:bg-blue-500/30 transition-colors"
            >
              âœCreate New Pattern
            </motion.button>
          </div>
        )}

        {/* Sequencer tab */}
        {tab === 'sequencer' && pattern && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/10">
              <div>
                <p className="text-xs font-medium text-white">{pattern.name}</p>
                <p className="text-[10px] text-white/40">{pattern.kit.toUpperCase()} â€{pattern.bpm} BPM</p>
              </div>
              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={isPlaying ? stopPattern : playPattern}
                  className={`
                    px-3 py-1.5 rounded text-xs font-semibold transition-colors
                    ${
                      isPlaying
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                    }
                  `}
                >
                  {isPlaying ? 'â¹ï¸Stop' : 'â–¶ï¸Play'}
                </motion.button>
              </div>
            </div>

            {/* Sound selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-white/70">Sounds</p>
              <div className="grid grid-cols-3 gap-2">
                {DRUM_SOUNDS.map((sound) => (
                  <motion.button
                    key={sound}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => playSound(sound)}
                    className="px-2 py-1.5 rounded text-xs font-medium bg-white/10 border border-white/20 text-white/80 hover:bg-white/15 transition-colors capitalize"
                  >
                    {sound}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 16-step sequencer grid */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-white/70">Pattern (16 Steps)</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {DRUM_SOUNDS.map((sound) => (
                  <div key={sound} className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-white/50 w-12 capitalize">{sound}</span>
                    <div className="flex gap-1 flex-wrap">
                      {Array.from({ length: 16 }, (_, i) => {
                        const step = pattern.steps[i];
                        const isActive = step?.sounds[sound];
                        return (
                          <motion.button
                            key={i}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => toggleStep(i, sound)}
                            className={`
                              w-5 h-5 rounded transition-all
                              ${
                                isActive
                                  ? 'bg-purple-500 border border-purple-300'
                                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
                              }
                            `}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Presets tab */}
        {tab === 'presets' && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-white/70">Preset Patterns</p>
            {presets.map((preset) => (
              <motion.button
                key={preset.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => loadPreset(preset)}
                className="w-full p-3 rounded-lg border border-white/10 bg-white/[0.04] text-left hover:bg-white/[0.08] transition-all"
              >
                <p className="text-sm font-medium text-white">{preset.name}</p>
                <p className="text-xs text-white/40">{preset.kit.toUpperCase()} â€{preset.bpm} BPM</p>
              </motion.button>
            ))}
          </div>
        )}

        {/* Export tab */}
        {tab === 'export' && pattern && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-white/[0.06] border border-white/10">
              <p className="text-xs font-medium text-white mb-2">Ready to export</p>
              <p className="text-[10px] text-white/60">
                {pattern.steps.filter((s) => Object.values(s.sounds).some(Boolean)).length} steps active
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleExport}
              className="w-full px-4 py-2.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 font-medium hover:bg-green-500/30 transition-colors"
            >
              â¬‡ï¸Export as WAV
            </motion.button>
            <p className="text-[10px] text-white/40">
              ğŸ’Tip: Export your drum pattern, then combine it with your vocal in Mix Combiner.
            </p>
          </div>
        )}

        {/* No pattern state */}
        {!pattern && tab === 'sequencer' && (
          <div className="text-center py-8">
            <p className="text-sm text-white/60">Select a kit to create a pattern</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DrumMachinePanel;
