/**
 * VocalChainControlsPanel
 *
 * Professional vocal chain control surface with artist-inspired presets.
 *
 * Features:
 *   - 5 preset chains: Drake (Hip-Hop), Travis Scott (Trap), Frank Ocean (R&B),
 *     Billie Eilish (Pop), Tyler (Alternative)
 *   - Full 14-stage chain control: pitch, cleanup, tonal, color, space
 *   - Real-time preset switching
 *   - Upload → process → download workflow
 *   - Before/after A/B comparison
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VocalChainConfig {
  // Pitch
  pitch_correct_strength: number;
  pitch_correct_mode: 'continuous' | 'global';
  pitch_scale: 'chromatic' | 'major' | 'minor' | 'pentatonic_major' | 'pentatonic_minor';
  // Cleanup
  plosive_remove: boolean;
  noise_reduce: boolean;
  de_breath_enable: boolean;
  // Tonal
  eq_enable: boolean;
  compress_enable: boolean;
  de_ess_enable: boolean;
  // Color
  saturation_enable: boolean;
  saturation_type: 'tape' | 'tube' | 'transformer';
  saturation_drive: number;
  exciter_enable: boolean;
  exciter_drive: number;
  exciter_wet: number;
  // Space
  doubler_enable: boolean;
  doubler_wet: number;
  reverb_enable: boolean;
  reverb_room: number;
  reverb_wet: number;
  delay_enable: boolean;
  delay_ms: number;
  delay_wet: number;
}

type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

// ─── Presets ──────────────────────────────────────────────────────────────────

const VOCAL_PRESETS: Record<string, { name: string; artist: string; config: VocalChainConfig }> = {
  drake: {
    name: 'Drake — Hip-Hop',
    artist: 'Drake, Kendrick, J. Cole',
    config: {
      pitch_correct_strength: 0.4,
      pitch_correct_mode: 'continuous',
      pitch_scale: 'chromatic',
      plosive_remove: true,
      noise_reduce: false,
      de_breath_enable: true,
      eq_enable: true,
      compress_enable: true,
      de_ess_enable: true,
      saturation_enable: true,
      saturation_type: 'tape',
      saturation_drive: 0.25,
      exciter_enable: true,
      exciter_drive: 0.3,
      exciter_wet: 0.18,
      doubler_enable: true,
      doubler_wet: 0.25,
      reverb_enable: true,
      reverb_room: 0.3,
      reverb_wet: 0.08,
      delay_enable: true,
      delay_ms: 80,
      delay_wet: 0.1,
    },
  },
  travis: {
    name: 'Travis Scott — Trap',
    artist: 'Travis, Playboi Carti, Gunna',
    config: {
      pitch_correct_strength: 0.55,  // harder tune on trap
      pitch_correct_mode: 'continuous',
      pitch_scale: 'pentatonic_minor',
      plosive_remove: true,
      noise_reduce: false,
      de_breath_enable: true,
      eq_enable: true,
      compress_enable: true,
      de_ess_enable: true,
      saturation_enable: true,
      saturation_type: 'tube',  // tube for the aggressive character
      saturation_drive: 0.4,
      exciter_enable: true,
      exciter_drive: 0.45,
      exciter_wet: 0.25,
      doubler_enable: true,
      doubler_wet: 0.3,
      reverb_enable: true,
      reverb_room: 0.25,
      reverb_wet: 0.06,
      delay_enable: true,
      delay_ms: 75,
      delay_wet: 0.08,
    },
  },
  frank: {
    name: 'Frank Ocean — R&B',
    artist: 'Frank, The Weeknd, Bryson Tiller',
    config: {
      pitch_correct_strength: 0.35,  // subtle for soulful feel
      pitch_correct_mode: 'continuous',
      pitch_scale: 'minor',
      plosive_remove: true,
      noise_reduce: true,  // clean R&B
      de_breath_enable: true,
      eq_enable: true,
      compress_enable: true,
      de_ess_enable: true,
      saturation_enable: true,
      saturation_type: 'tape',  // warm tape
      saturation_drive: 0.2,
      exciter_enable: true,
      exciter_drive: 0.25,
      exciter_wet: 0.15,
      doubler_enable: true,
      doubler_wet: 0.28,
      reverb_enable: true,
      reverb_room: 0.4,
      reverb_wet: 0.12,
      delay_enable: true,
      delay_ms: 90,
      delay_wet: 0.14,
    },
  },
  billie: {
    name: 'Billie Eilish — Pop',
    artist: 'Billie, Olivia Rodrigo, SZA',
    config: {
      pitch_correct_strength: 0.3,   // very subtle — modern pop
      pitch_correct_mode: 'continuous',
      pitch_scale: 'major',
      plosive_remove: true,
      noise_reduce: false,
      de_breath_enable: true,
      eq_enable: true,
      compress_enable: true,
      de_ess_enable: false,  // keep sibilance for modern pop
      saturation_enable: false,  // clean modern sound
      saturation_type: 'tape',
      saturation_drive: 0.0,
      exciter_enable: true,
      exciter_drive: 0.3,
      exciter_wet: 0.2,
      doubler_enable: true,
      doubler_wet: 0.2,
      reverb_enable: true,
      reverb_room: 0.35,
      reverb_wet: 0.09,
      delay_enable: true,
      delay_ms: 85,
      delay_wet: 0.11,
    },
  },
  tyler: {
    name: 'Tyler, The Creator — Alt',
    artist: 'Tyler, Earl Sweatshirt, MIKE',
    config: {
      pitch_correct_strength: 0.25,  // minimal correction — raw feel
      pitch_correct_mode: 'global',   // global for lo-fi vibe
      pitch_scale: 'chromatic',
      plosive_remove: true,
      noise_reduce: false,
      de_breath_enable: true,
      eq_enable: true,
      compress_enable: true,
      de_ess_enable: true,
      saturation_enable: true,
      saturation_type: 'transformer',  // colored, punchy
      saturation_drive: 0.35,
      exciter_enable: true,
      exciter_drive: 0.4,
      exciter_wet: 0.22,
      doubler_enable: true,
      doubler_wet: 0.32,
      reverb_enable: true,
      reverb_room: 0.38,
      reverb_wet: 0.1,
      delay_enable: true,
      delay_ms: 95,
      delay_wet: 0.13,
    },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const VocalChainControlsPanel: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<string>('drake');
  const [config, setConfig] = useState<VocalChainConfig>(VOCAL_PRESETS.drake.config);
  const [file, setFile] = useState<File | null>(null);
  const [beatFile, setBeatFile] = useState<File | null>(null);
  const [changeRequest, setChangeRequest] = useState<string>('');
  const [beatBpm, setBeatBpm] = useState<number>(120);
  const [beatKey, setBeatKey] = useState<string>('C');
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [savedPresets, setSavedPresets] = useState<Record<string, VocalChainConfig>>({});
  const [harmonizeEnable, setHarmonizeEnable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const beatInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const applyPreset = useCallback((presetKey: string) => {
    setSelectedPreset(presetKey);
    setConfig(VOCAL_PRESETS[presetKey].config);
  }, []);

  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setProcessedUrl(null);
  }, []);

  const handleProcess = useCallback(
    async (processAndMaster: boolean = false) => {
      if (!file) return;

      setStatus('uploading');
      setProgress(0);

      // Calculate BPM-synced delay if beat is provided
      let delayMs = config.delay_ms;
      if (beatBpm && beatBpm > 0) {
        // Quarter note delay at beat BPM
        delayMs = (60000 / beatBpm);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('genre', 'hip_hop');
      formData.append('request_text', changeRequest.trim());
      formData.append('pitch_correct_strength', config.pitch_correct_strength.toString());
      formData.append('pitch_correct_mode', config.pitch_correct_mode);
      formData.append('pitch_scale', config.pitch_scale);
      formData.append('plosive_remove', config.plosive_remove.toString());
      formData.append('noise_reduce', config.noise_reduce.toString());
      formData.append('de_breath_enable', config.de_breath_enable.toString());
      formData.append('eq_enable', config.eq_enable.toString());
      formData.append('compress_enable', config.compress_enable.toString());
      formData.append('de_ess_enable', config.de_ess_enable.toString());
      formData.append('saturation_enable', config.saturation_enable.toString());
      formData.append('saturation_type', config.saturation_type);
      formData.append('saturation_drive', config.saturation_drive.toString());
      formData.append('exciter_enable', config.exciter_enable.toString());
      formData.append('exciter_drive', config.exciter_drive.toString());
      formData.append('exciter_wet', config.exciter_wet.toString());
      formData.append('doubler_enable', config.doubler_enable.toString());
      formData.append('doubler_wet', config.doubler_wet.toString());
      formData.append('reverb_enable', config.reverb_enable.toString());
      formData.append('reverb_room', config.reverb_room.toString());
      formData.append('reverb_wet', config.reverb_wet.toString());
      formData.append('delay_enable', config.delay_enable.toString());
      formData.append('delay_ms', delayMs.toString());
      formData.append('delay_wet', config.delay_wet.toString());
      formData.append('harmonize_enable', harmonizeEnable.toString());
      formData.append('harmony_wet', '0.25');
      formData.append('bit_depth', '24');

      try {
        setProgress(20);
        setStatus('processing');

        // Correct endpoint: /api/proxy/dsp/vocal-chain
        const response = await fetch('/api/proxy/dsp/vocal-chain', {
          method: 'POST',
          body: formData,
        });

        setProgress(60);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        setProgress(90);

        const url = URL.createObjectURL(blob);
        setProcessedUrl(url);
        setPreviewUrl(url);

        // Quick preview: decode first 3 seconds
        try {
          const ctx = new AudioContext();
          const buf = await blob.slice(0, Math.min(300000, blob.size)).arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          setShowPreview(true);
        } catch {
          // Fallback if preview decode fails
        }

        setProgress(100);
        setStatus('done');

        setTimeout(() => setProgress(0), 2000);
      } catch (err) {
        console.error('Vocal chain processing failed:', err);
        setStatus('error');
        setTimeout(() => {
          setStatus('idle');
          setProgress(0);
        }, 3000);
      }
    },
    [file, config, harmonizeEnable, beatBpm, changeRequest]
  );

  const handleDownload = useCallback(() => {
    if (!processedUrl || !file) return;
    const a = document.createElement('a');
    a.href = processedUrl;
    a.download = file.name.replace(/\.[^.]+$/, '') + '_processed.wav';
    a.click();
  }, [processedUrl, file]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <h2 className="text-lg font-semibold text-white">Vocal Chain Studio</h2>
        <p className="text-xs text-white/40 mt-1">
          Choose an artist style, upload your vocal, and get pro-level processing
        </p>
      </div>

      {/* Presets */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">
          Artist Presets
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(VOCAL_PRESETS).map(([key, { name, artist }]) => (
            <motion.button
              key={key}
              whileTap={{ scale: 0.97 }}
              onClick={() => applyPreset(key)}
              className={`
                p-3 rounded-lg text-left transition-all duration-150 border
                ${
                  selectedPreset === key
                    ? 'border-blue-500/50 bg-blue-500/10 text-white'
                    : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                }
              `}
            >
              <div className="text-sm font-medium">{name.split(' — ')[1]}</div>
              <div className="text-xs text-white/40 mt-1">{artist}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Change Brief */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">Change Brief</p>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <label className="text-xs font-medium text-white/70 mb-2 block">
            Tell the engine exactly what you want changed
          </label>
          <textarea
            value={changeRequest}
            onChange={(e) => setChangeRequest(e.target.value)}
            rows={4}
            placeholder="Example: keep the dynamic EQ subtle, bring the main vocal forward, lower the beat a touch, and keep it clean with only a light reverb."
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-orange-400/40 focus:ring-1 focus:ring-orange-400/20"
          />
          <p className="mt-2 text-[11px] leading-5 text-white/40">
            Use this instead of tweaking every effect knob. The detailed chain stays available below if you want it.
          </p>
        </div>
      </div>

      {/* Processing Controls */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <div className="space-y-3">
          {/* File Upload */}
          <div>
            <label className="text-xs font-medium text-white/70 mb-2 block">Vocal File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/wav,.wav"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-2.5 rounded-lg border border-white/15 bg-white/[0.08] text-white/80 text-sm font-medium hover:bg-white/[0.14] transition-colors"
            >
              {file ? `✓ ${file.name}` : '⬆ Choose Vocal WAV'}
            </motion.button>
          </div>

          {/* Harmonizer toggle */}
          <label className="flex items-center gap-2 text-xs text-white/60 p-2 rounded bg-white/[0.04] border border-white/10">
            <input
              type="checkbox"
              checked={harmonizeEnable}
              onChange={(e) => setHarmonizeEnable(e.target.checked)}
              className="w-4 h-4 rounded border-white/30"
            />
            <span>Add 3-Voice Harmonies (The Weeknd style)</span>
          </label>

          {/* Process Button */}
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handleProcess(false)}
              disabled={!file || status === 'processing'}
              className={`
                px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 border
                ${
                  status === 'processing'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : !file
                      ? 'border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15'
                }
              `}
            >
              {status === 'processing' ? `${progress}%` : 'Process'}
            </motion.button>

            {/* Process & Master button — for future Grammy mastering integration */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={!file || status === 'processing'}
              className={`
                px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 border
                ${
                  !file
                    ? 'border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed'
                    : 'border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/15'
                }
              `}
              title="Process vocal, then master with Grammy (drag result to Grammy Master panel)"
            >
              ✨ Process + Master
            </motion.button>
          </div>

          {/* A/B Preview */}
          <AnimatePresence>
            {showPreview && previewUrl && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-lg bg-white/[0.06] border border-white/10 p-3 space-y-2"
              >
                <div className="text-xs font-medium text-white/70">A/B Preview (First 3 seconds)</div>
                <audio
                  ref={audioRef}
                  src={previewUrl}
                  controls
                  className="w-full h-6"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download & Next Steps */}
          <AnimatePresence>
            {processedUrl && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-2"
              >
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownload}
                  className="w-full px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/15 transition-colors"
                >
                  ⬇ Download Processed Vocal
                </motion.button>

                {/* Grammy Master info card */}
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 text-xs text-white/70">
                  <p className="font-medium text-purple-300 mb-1">Next: Grammy Master</p>
                  <p>
                    Drop your processed vocal + beat into the <strong>Mix Combiner</strong> panel below, then <strong>Grammy Master</strong> for final mastering + platform export.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Preset Management */}
      <div className="px-6 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Save as preset name..."
            className="flex-1 px-2 py-1.5 rounded text-xs bg-white/10 border border-white/20 text-white placeholder-white/40"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                const name = (e.target as HTMLInputElement).value;
                setSavedPresets({ ...savedPresets, [name]: config });
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              const input = document.querySelector(
                'input[placeholder="Save as preset name..."]'
              ) as HTMLInputElement;
              if (input?.value) {
                setSavedPresets({ ...savedPresets, [input.value]: config });
                input.value = '';
              }
            }}
            className="px-3 py-1.5 rounded text-xs bg-white/10 border border-white/20 text-white/70 hover:bg-white/[0.15] transition-colors"
          >
            💾
          </motion.button>
        </div>
        {Object.keys(savedPresets).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.keys(savedPresets).map((name) => (
              <motion.button
                key={name}
                whileTap={{ scale: 0.95 }}
                onClick={() => setConfig(savedPresets[name])}
                className="px-2 py-1 rounded text-xs bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition-colors"
              >
                {name}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Chain Settings (Compact) */}
      <div className="px-6 py-4">
        <details className="cursor-pointer group">
          <summary className="text-xs font-medium text-white/50 uppercase tracking-wide hover:text-white/70 transition-colors">
            + Advanced Chain Settings
          </summary>
          <div className="mt-4 space-y-4 grid grid-cols-2 gap-4">
            {/* Beat Context */}
            <div className="col-span-2">
              <p className="text-xs font-semibold text-white mb-2">Beat Context (Optional)</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-white/60 block mb-1">BPM</label>
                  <input
                    type="number"
                    min="60"
                    max="200"
                    value={beatBpm}
                    onChange={(e) => setBeatBpm(parseInt(e.target.value))}
                    className="w-full px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white text-sm text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 block mb-1">Key</label>
                  <select
                    value={beatKey}
                    onChange={(e) => setBeatKey(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white text-xs"
                  >
                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60 block mb-1">Beat File</label>
                  <input
                    ref={beatInputRef}
                    type="file"
                    accept="audio/wav,.wav"
                    onChange={(e) => e.target.files?.[0] && setBeatFile(e.target.files[0])}
                    className="hidden"
                  />
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => beatInputRef.current?.click()}
                    className="w-full px-2 py-1.5 rounded text-xs bg-white/10 border border-white/20 text-white/70 hover:bg-white/[0.15] transition-colors"
                  >
                    {beatFile ? '✓' : '⬆'}
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Pitch Section */}
            <div className="col-span-2">
              <p className="text-xs font-semibold text-white mb-2">Pitch Correction</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-white/60">Strength: {config.pitch_correct_strength.toFixed(2)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.pitch_correct_strength}
                    onChange={(e) =>
                      setConfig({ ...config, pitch_correct_strength: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={config.pitch_correct_mode === 'continuous'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        pitch_correct_mode: e.target.checked ? 'continuous' : 'global',
                      })
                    }
                    className="w-4 h-4 rounded border-white/30"
                  />
                  Continuous Mode (frame-by-frame)
                </label>
              </div>
            </div>

            {/* Cleanup Section */}
            <div>
              <p className="text-xs font-semibold text-white mb-2">Cleanup</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={config.plosive_remove}
                    onChange={(e) => setConfig({ ...config, plosive_remove: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30"
                  />
                  Plosive Removal
                </label>
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={config.de_breath_enable}
                    onChange={(e) => setConfig({ ...config, de_breath_enable: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30"
                  />
                  De-Breath
                </label>
              </div>
            </div>

            {/* Color Section */}
            <div>
              <p className="text-xs font-semibold text-white mb-2">Color</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={config.saturation_enable}
                    onChange={(e) => setConfig({ ...config, saturation_enable: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30"
                  />
                  Saturation
                </label>
                {config.saturation_enable && (
                  <select
                    value={config.saturation_type}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        saturation_type: e.target.value as any,
                      })
                    }
                    className="w-full px-2 py-1 rounded text-xs bg-white/10 border border-white/20 text-white"
                  >
                    <option value="tape">Tape</option>
                    <option value="tube">Tube</option>
                    <option value="transformer">Transformer</option>
                  </select>
                )}
              </div>
            </div>

            {/* Space Section */}
            <div>
              <p className="text-xs font-semibold text-white mb-2">Space</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={config.reverb_enable}
                    onChange={(e) => setConfig({ ...config, reverb_enable: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30"
                  />
                  Reverb
                </label>
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={config.delay_enable}
                    onChange={(e) => setConfig({ ...config, delay_enable: e.target.checked })}
                    className="w-4 h-4 rounded border-white/30"
                  />
                  Delay
                </label>
              </div>
            </div>
          </div>
        </details>
      </div>
    </motion.div>
  );
};

export default VocalChainControlsPanel;
