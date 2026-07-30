import React, { useMemo, useState } from 'react';
import { DynamicEQConfig, DynamicEQBand } from '../types';
import { EQCurveVisualizer } from './EQCurveVisualizer';
import { glassCard } from '../utils/secondLightStyles';

interface ParametricEQPanelProps {
  dynamicEq: DynamicEQConfig;
  onDynamicEQChange: (config: DynamicEQConfig) => void;
}

type QuickPresetId = 'subtle' | 'balanced' | 'focused';

const createBand = (
  id: string,
  frequency: number,
  gain: number,
  q: number,
  threshold: number,
  attack: number,
  release: number,
  type: DynamicEQBand['type'] = 'peaking',
  mode: DynamicEQBand['mode'] = 'compress',
  enabled = true,
): DynamicEQBand => ({
  id,
  frequency,
  gain,
  q,
  threshold,
  attack,
  release,
  type,
  mode,
  enabled,
});

const QUICK_PRESETS: Record<QuickPresetId, { label: string; description: string; bands: DynamicEQConfig }> = {
  subtle: {
    label: 'Subtle',
    description: 'Light cleanup, mostly invisible.',
    bands: [
      createBand('subtle-low', 340, -1.0, 0.9, -24, 8, 120),
      createBand('subtle-air', 5200, -0.5, 1.1, -22, 6, 110),
    ],
  },
  balanced: {
    label: 'Balanced',
    description: 'The default pocket fix for most vocals.',
    bands: [
      createBand('balanced-low', 290, -1.8, 1.0, -26, 8, 140),
      createBand('balanced-presence', 4800, -1.0, 1.1, -24, 6, 120),
    ],
  },
  focused: {
    label: 'Focused',
    description: 'A little tighter, with clearer vocal presence.',
    bands: [
      createBand('focused-low', 250, -2.4, 1.0, -28, 6, 160),
      createBand('focused-presence', 6500, -1.4, 1.0, -26, 5, 130, 'highshelf'),
    ],
  },
};

export const ParametricEQPanel: React.FC<ParametricEQPanelProps> = ({ dynamicEq, onDynamicEQChange }) => {
  const [expandedBand, setExpandedBand] = useState<string | null>(dynamicEq[0]?.id || null);
  const activeBands = useMemo(() => dynamicEq.filter((band) => band.enabled), [dynamicEq]);

  const handleBandChange = (id: string, updates: Partial<DynamicEQBand>) => {
    const newConfig = dynamicEq.map((band) => (band.id === id ? { ...band, ...updates } : band));
    onDynamicEQChange(newConfig);
  };

  const handleCopyBand = (fromId: string, toId: string) => {
    const sourceBand = dynamicEq.find((band) => band.id === fromId);
    if (sourceBand) {
      handleBandChange(toId, {
        frequency: sourceBand.frequency,
        gain: sourceBand.gain,
        q: sourceBand.q,
        threshold: sourceBand.threshold,
        attack: sourceBand.attack,
        release: sourceBand.release,
        type: sourceBand.type,
        mode: sourceBand.mode,
        enabled: sourceBand.enabled,
      });
    }
  };

  const handleCurveChange = (bandIndex: number, updates: { frequency?: number; gain?: number } | number) => {
    const isNumber = typeof updates === 'number';
    const enabledBands = dynamicEq.filter((band) => band.enabled);
    if (bandIndex < enabledBands.length) {
      const band = enabledBands[bandIndex];
      const updateObj = isNumber ? { gain: updates } : updates;
      handleBandChange(band.id, updateObj);
    }
  };

  const applyQuickPreset = (presetId: QuickPresetId) => {
    const preset = QUICK_PRESETS[presetId];
    onDynamicEQChange(
      preset.bands.map((band, index) => ({
        ...band,
        id: `${presetId}-${index}`,
      })),
    );
    setExpandedBand(`${presetId}-0`);
  };

  const getFrequencyLabel = (freq: number): string => {
    if (freq < 1000) return `${Math.round(freq)}Hz`;
    return `${(freq / 1000).toFixed(2)}kHz`;
  };

  return (
    <div className={`${glassCard} space-y-6`}>
      <style>{`
        .param-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, rgba(239, 68, 68, 0.2) 0%, rgba(100, 116, 139, 0.3) 50%, rgba(34, 197, 94, 0.2) 100%);
          border: 1px solid rgba(148, 163, 184, 0.2);
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          outline: none;
        }
        .param-slider::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f97316, #ec4899);
          border: 2px solid rgba(251, 146, 60, 0.6);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.2);
          cursor: grab;
          transition: all 0.15s ease-out;
        }
        .param-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3);
        }
        .param-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.05);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }
        .param-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f97316, #ec4899);
          border: 2px solid rgba(251, 146, 60, 0.6);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.2);
          cursor: grab;
          transition: all 0.15s ease-out;
        }
        .param-slider::-moz-range-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3);
        }
        .param-slider::-moz-range-thumb:active {
          cursor: grabbing;
          transform: scale(1.05);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }
        .param-slider::-moz-range-track {
          background: transparent;
          border: none;
        }
      `}</style>

      <div>
        <h3 className="text-lg font-bold text-slate-200 mb-1">Dynamic EQ</h3>
        <p className="text-xs text-slate-400">Quick presets up front. The detailed band editor stays tucked away unless you need it.</p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-2">Quick Start</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.entries(QUICK_PRESETS) as Array<[QuickPresetId, (typeof QUICK_PRESETS)[QuickPresetId]]>).map(([presetId, preset]) => (
            <button
              key={presetId}
              type="button"
              onClick={() => applyQuickPreset(presetId)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:bg-white/[0.08]"
            >
              <div className="text-sm font-semibold text-white">{preset.label}</div>
              <div className="mt-1 text-[11px] leading-5 text-slate-400">{preset.description}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span>{activeBands.length} active band{activeBands.length === 1 ? '' : 's'}</span>
            <span>Simple mode stays on unless you open advanced band editing.</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-2">Current Curve</p>
        <p className="text-xs text-slate-400 mb-3">Read-only preview of the active bands. Open advanced editing only if you need surgical control.</p>
        <EQCurveVisualizer
          bands={activeBands.map((band) => ({ frequency: band.frequency, gain: band.gain }))}
          width={400}
          height={120}
          showGrid={true}
          showLabels={true}
          onBandChange={handleCurveChange}
          interactive={false}
        />
      </div>

      <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.24em] text-slate-500">Advanced Band Editing</summary>
        <div className="mt-4 space-y-3">
          {dynamicEq.map((band, bandIndex) => (
            <div
              key={band.id}
              className={`rounded-lg overflow-hidden transition-all ${
                band.enabled
                  ? 'border border-orange-500/20 bg-gradient-to-br from-slate-800/40 to-slate-800/20'
                  : 'border border-slate-700/30 bg-slate-800/15'
              }`}
            >
              <button
                onClick={() => setExpandedBand(expandedBand === band.id ? null : band.id)}
                className={`w-full px-4 py-3 flex items-center justify-between transition-all text-left ${
                  band.enabled ? 'hover:bg-slate-800/40' : 'hover:bg-slate-800/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={band.enabled}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleBandChange(band.id, { enabled: e.target.checked });
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className={`font-bold text-sm transition-colors ${band.enabled ? 'text-slate-200' : 'text-slate-500'}`}>
                      BAND {bandIndex + 1}
                    </span>
                  </label>
                  <div className={`w-2 h-2 rounded-full transition-all ${band.enabled ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]' : 'bg-slate-600'}`} />
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-mono transition-colors ${band.enabled ? 'text-orange-400/80' : 'text-slate-600'}`}>
                    {getFrequencyLabel(band.frequency)} • {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}dB • Q{band.q.toFixed(1)}
                  </span>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-all duration-200 ${expandedBand === band.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </button>

              {band.enabled && expandedBand === band.id && (
                <div className="px-4 py-4 border-t border-white/10 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-300">Frequency</label>
                      <span className="text-xs font-mono text-orange-400">{getFrequencyLabel(band.frequency)}</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="20000"
                      step="10"
                      value={band.frequency}
                      onChange={(e) => handleBandChange(band.id, { frequency: parseFloat(e.target.value) })}
                      className="param-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-300">Gain</label>
                      <span className={`text-xs font-mono ${band.gain > 0 ? 'text-emerald-400' : band.gain < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.1"
                      value={band.gain}
                      onChange={(e) => handleBandChange(band.id, { gain: parseFloat(e.target.value) })}
                      className="param-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-300">Q (Resonance)</label>
                      <span className="text-xs font-mono text-slate-400">{band.q.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={band.q}
                      onChange={(e) => handleBandChange(band.id, { q: parseFloat(e.target.value) })}
                      className="param-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-300">Threshold</label>
                      <span className="text-xs font-mono text-slate-400">{band.threshold.toFixed(0)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="0"
                      step="1"
                      value={band.threshold}
                      onChange={(e) => handleBandChange(band.id, { threshold: parseFloat(e.target.value) })}
                      className="param-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-300">Attack</label>
                      <span className="text-xs font-mono text-slate-400">{(band.attack * 1000).toFixed(1)} ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.001"
                      max="0.1"
                      step="0.001"
                      value={band.attack}
                      onChange={(e) => handleBandChange(band.id, { attack: parseFloat(e.target.value) })}
                      className="param-slider"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-300">Release</label>
                      <span className="text-xs font-mono text-slate-400">{(band.release * 1000).toFixed(1)} ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={band.release}
                      onChange={(e) => handleBandChange(band.id, { release: parseFloat(e.target.value) })}
                      className="param-slider"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <label className="block text-xs font-bold text-slate-300">Mode</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleBandChange(band.id, { mode: 'compress' })}
                        className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                          band.mode === 'compress'
                            ? 'bg-gradient-to-br from-orange-500/30 to-orange-600/20 text-orange-400 border border-orange-500/50 shadow-[0_2px_8px_rgba(249,115,22,0.2)]'
                            : 'bg-slate-700/40 text-slate-400 border border-white/10 hover:bg-slate-700/50'
                        }`}
                      >
                        Compress
                      </button>
                      <button
                        onClick={() => handleBandChange(band.id, { mode: 'expand' })}
                        className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                          band.mode === 'expand'
                            ? 'bg-gradient-to-br from-sky-500/30 to-sky-600/20 text-sky-300 border border-sky-500/50 shadow-[0_2px_8px_rgba(59,130,246,0.2)]'
                            : 'bg-slate-700/40 text-slate-400 border border-white/10 hover:bg-slate-700/50'
                        }`}
                      >
                        Expand
                      </button>
                    </div>
                  </div>

                  {bandIndex === 0 && dynamicEq[1] && (
                    <button
                      onClick={() => handleCopyBand(band.id, dynamicEq[1].id)}
                      className="w-full py-2.5 text-xs font-bold bg-gradient-to-br from-blue-500/20 to-blue-600/10 hover:from-blue-500/30 hover:to-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg transition-all shadow-[0_2px_8px_rgba(59,130,246,0.1)] hover:shadow-[0_4px_12px_rgba(59,130,246,0.15)]"
                    >
                      Copy Band 1 to Band 2
                    </button>
                  )}
                </div>
              )}

              {!expandedBand?.includes(band.id) && !band.enabled && (
                <div className="px-4 py-2 bg-slate-800/20">
                  <p className="text-xs text-slate-500">Disabled</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

export default ParametricEQPanel;
