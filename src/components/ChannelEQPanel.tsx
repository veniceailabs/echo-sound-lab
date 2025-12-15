import React, { useState } from 'react';
import { EQSettings } from '../types';
import { EQCurveVisualizer } from './EQCurveVisualizer';
import { glassCard } from '../utils/secondLightStyles';

interface ChannelEQPanelProps {
  eqSettings: EQSettings;
  onEQChange: (settings: EQSettings) => void;
}

/**
 * Channel EQ Panel - Simple 5-band fixed EQ for quick tonal adjustments
 *
 * DESIGN PRINCIPLE: Biases toward inaudibility by default
 * - All bands default to 0dB (no processing)
 * - User must deliberately adjust sliders to hear any effect
 * - This ensures the tool enhances, never degrades, by default
 */
export const ChannelEQPanel: React.FC<ChannelEQPanelProps> = ({ eqSettings, onEQChange }) => {
  const [activeBand, setActiveBand] = useState<number | null>(null);

  const handleBandChange = (index: number, gain: number) => {
    const newSettings = [...eqSettings];
    newSettings[index] = { ...newSettings[index], gain };
    onEQChange(newSettings);
  };

  const handleResetBand = (index: number) => {
    handleBandChange(index, 0);
  };

  const handleResetAll = () => {
    onEQChange(eqSettings.map(band => ({ ...band, gain: 0 })));
  };

  const getBandLabel = (freq: number): string => {
    if (freq < 1000) return `${freq}Hz`;
    return `${(freq / 1000).toFixed(1)}kHz`;
  };

  const getGainColor = (gain: number): string => {
    if (gain > 0.1) return 'text-emerald-400';
    if (gain < -0.1) return 'text-rose-400';
    return 'text-slate-400';
  };

  return (
    <div className={`${glassCard} space-y-6`}>
      {/* Title */}
      <div>
        <h3 className="text-lg font-bold text-slate-200 mb-1">Channel EQ</h3>
        <p className="text-xs text-slate-400">Simple 5-band fixed EQ for quick tonal adjustments</p>
      </div>

      {/* EQ Curve Visualization */}
      <div>
        <EQCurveVisualizer
          bands={eqSettings.map(band => ({ frequency: band.frequency, gain: band.gain }))}
          width={400}
          height={120}
          showGrid={true}
          showLabels={true}
        />
      </div>

      {/* Slider Controls Grid */}
      <style>{`
        .eq-slider-vertical {
          width: 32px;
          height: 160px;
          -webkit-appearance: slider-vertical;
          appearance: slider-vertical;
          background: transparent;
          cursor: pointer;
          writing-mode: bt-lr;
          -webkit-writing-mode: bt-lr;
          -moz-appearance: slider-vertical;
          outline: none;
        }
        .eq-slider-vertical::-webkit-slider-runnable-track {
          width: 4px;
          height: 160px;
          background: linear-gradient(to top, rgba(239, 68, 68, 0.2) 0%, rgba(100, 116, 139, 0.3) 50%, rgba(34, 197, 94, 0.2) 100%);
          border-radius: 2px;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .eq-slider-vertical::-webkit-slider-thumb {
          -webkit-appearance: slider-thumb;
          appearance: slider-thumb;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f97316, #ec4899);
          border: 2px solid rgba(251, 146, 60, 0.7);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3);
          cursor: grab;
          transition: all 0.15s ease-out;
        }
        .eq-slider-vertical::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.4);
        }
        .eq-slider-vertical::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(0.95);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .eq-slider-vertical::-moz-range-track {
          background: transparent;
          border: none;
        }
        .eq-slider-vertical::-moz-range-progress {
          background: linear-gradient(to top, rgba(239, 68, 68, 0.2) 0%, rgba(100, 116, 139, 0.3) 50%, rgba(34, 197, 94, 0.2) 100%);
          border-radius: 2px;
        }
        .eq-slider-vertical::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f97316, #ec4899);
          border: 2px solid rgba(251, 146, 60, 0.7);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3);
          cursor: grab;
          transition: all 0.15s ease-out;
        }
        .eq-slider-vertical::-moz-range-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.4);
        }
        .eq-slider-vertical::-moz-range-thumb:active {
          cursor: grabbing;
          transform: scale(0.95);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }
      `}</style>

      <div className="grid grid-cols-5 gap-3">
        {eqSettings.map((band, index) => (
          <div
            key={index}
            className={`flex flex-col items-center gap-3 p-3 rounded-lg transition-all ${
              activeBand === index
                ? 'bg-white/5 border border-orange-500/30'
                : 'bg-white/0 border border-transparent hover:bg-white/[0.02]'
            }`}
            onMouseEnter={() => setActiveBand(index)}
            onMouseLeave={() => setActiveBand(null)}
          >
            {/* Vertical Slider */}
            <div className="relative h-40 w-12 flex items-center justify-center">
              <input
                type="range"
                min="-12"
                max="12"
                step="0.1"
                value={band.gain}
                onChange={(e) => handleBandChange(index, parseFloat(e.target.value))}
                onMouseDown={() => setActiveBand(index)}
                onMouseUp={() => setActiveBand(null)}
                className="eq-slider-vertical"
              />

              {/* Center line indicator */}
              <div className="absolute w-3 h-px bg-slate-500/40 pointer-events-none" />
            </div>

            {/* Frequency Label */}
            <div className="text-center">
              <div className="text-xs font-bold text-slate-300">{getBandLabel(band.frequency)}</div>
            </div>

            {/* Gain Value Display - with smooth transition */}
            <div className={`text-sm font-bold font-mono ${getGainColor(band.gain)} min-h-6 text-center transition-colors duration-150`}>
              {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}
              <span className="text-xs opacity-60"> dB</span>
            </div>

            {/* Reset Button - with improved styling */}
            <button
              onClick={() => handleResetBand(index)}
              disabled={Math.abs(band.gain) < 0.05}
              className="w-full px-2 py-1.5 text-xs font-bold bg-slate-800/40 hover:bg-slate-700/60 disabled:bg-slate-800/20 disabled:opacity-50 text-slate-400 hover:text-slate-300 disabled:text-slate-500 rounded transition-all hover:shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:cursor-not-allowed"
              title="Reset to 0dB"
            >
              Reset
            </button>
          </div>
        ))}
      </div>

      {/* Reset All Button */}
      <div className="flex justify-end pt-4 border-t border-white/10">
        <button
          onClick={handleResetAll}
          disabled={eqSettings.every(b => Math.abs(b.gain) < 0.05)}
          className="px-6 py-2.5 text-sm font-bold bg-gradient-to-br from-orange-500/25 to-orange-600/15 hover:from-orange-500/35 hover:to-orange-600/25 disabled:from-slate-800/20 disabled:to-slate-800/10 text-orange-400 disabled:text-slate-500 border border-orange-500/40 disabled:border-white/10 rounded-lg transition-all shadow-[0_4px_12px_rgba(249,115,22,0.1)] hover:shadow-[0_6px_16px_rgba(249,115,22,0.15)] disabled:shadow-none active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] disabled:cursor-not-allowed"
        >
          Reset All Bands
        </button>
      </div>
    </div>
  );
};
