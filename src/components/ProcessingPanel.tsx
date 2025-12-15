import React, { useState, useEffect, useRef } from 'react';
import { AudioMetrics, ProcessingConfig, LiveProcessingConfig, ExportFormat, ReverbConfig, SaturationConfig, StereoImagerConfig, DynamicEQConfig, EQSettings, CompressionPreset, MultibandCompressionConfig, TransientShaperConfig, DeEsserConfig } from '../types';
import { audioEngine } from '../services/audioEngine';
import { encoderService } from '../services/encoderService';
import { glassCard, glowButton, secondaryButton, metricCard, gradientDivider, sectionHeader, cn } from '../utils/secondLightStyles';

interface ProcessingPanelProps {
  originalMetrics: AudioMetrics;
  onCommit: (config: ProcessingConfig, appliedEchoAction?: any) => Promise<AudioMetrics | null>;
  onConfigChange: (config: LiveProcessingConfig) => void;
  isCommitting: boolean;
  processedMetrics: AudioMetrics | null;
  echoReport: any;
  onToggleAB: () => void;
  isAbComparing: boolean;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onExportComplete?: () => void; // V.E.N.U.M. hook
  hasAppliedChanges?: boolean;
  // EQ state (lifted from local state in App.tsx)
  eqSettings: EQSettings;
  setEqSettings: (settings: EQSettings) => void;
  dynamicEq: DynamicEQConfig;
  setDynamicEq: (config: DynamicEQConfig) => void;
}

export const ProcessingPanel: React.FC<ProcessingPanelProps> = ({
  originalMetrics,
  processedMetrics,
  onCommit,
  onConfigChange,
  isCommitting,
  echoReport,
  isAbComparing,
  onToggleAB,
  isPlaying,
  onTogglePlayback,
  onExportComplete,
  hasAppliedChanges = false,
  eqSettings,
  setEqSettings,
  dynamicEq,
  setDynamicEq,
}) => {
  const [compression, setCompression] = useState<Partial<CompressionPreset>>({ threshold: -24, ratio: 3, attack: 0.003, release: 0.25, makeupGain: 0 });
  const [multiband, setMultiband] = useState<MultibandCompressionConfig>({ low: {}, mid: {}, high: {}, crossovers: [150, 4000] });
  const [transient, setTransient] = useState<TransientShaperConfig>({ attack: 0, sustain: 0, mix: 1 });
  const [deEsser, setDeEsser] = useState<DeEsserConfig>({ frequency: 7000, threshold: -20, amount: 0 });
  const [saturation, setSaturation] = useState<SaturationConfig>({ type: 'tape', amount: 0, mix: 1 });
  const [reverb, setReverb] = useState<ReverbConfig>({ mix: 0, decay: 2.0, preDelay: 0.01, motion: { bpm: 120, depth: 0 }, duckingAmount: 0 });
  const [imager, setImager] = useState<StereoImagerConfig>({ lowWidth: 1, midWidth: 1, highWidth: 1, crossovers: [300, 5000] });
  const currentLiveConfig = useRef<LiveProcessingConfig>({});
  // Changed NodeJS.Timeout to number for browser compatibility
  const configChangeTimeout = useRef<number | null>(null);

  useEffect(() => {
    const config: LiveProcessingConfig = {
        compression: (compression.threshold !== -24 || compression.ratio !== 3 || (compression.makeupGain ?? 0) !== 0) ? compression : undefined,
        eq: eqSettings.some(b => b.gain !== 0) ? eqSettings : undefined,
        multibandCompression: multiband,
        transientShaper: transient.attack !== 0 || transient.sustain !== 0 || transient.mix !== 1 ? transient : undefined,
        deEsser: deEsser.amount > 0 ? deEsser : undefined,
        saturation: saturation.amount > 0 || saturation.mix !== 1 ? saturation : undefined,
        motionReverb: reverb.mix > 0 ? reverb : undefined,
        stereoImager: imager.lowWidth !== 1 || imager.midWidth !== 1 ? imager : undefined,
        dynamicEq: dynamicEq.filter(b => b.enabled).length > 0 ? dynamicEq : undefined
    };
    currentLiveConfig.current = config;

    // Debounce config changes to prevent spam - only update when user stops adjusting
    if (configChangeTimeout.current) {
      clearTimeout(configChangeTimeout.current);
    }
    configChangeTimeout.current = setTimeout(() => {
      if (!isAbComparing) {
        onConfigChange(config);
      }
    }, 100); // 100ms debounce

    return () => {
      if (configChangeTimeout.current) {
        clearTimeout(configChangeTimeout.current);
      }
    };
  }, [eqSettings, multiband, transient, deEsser, saturation, reverb, imager, dynamicEq, compression, onConfigChange, isAbComparing]);

  const handleCommit = () => {
    onCommit(currentLiveConfig.current, undefined);
  };

  const handleExport = async (format: 'wav' | 'mp3' = 'wav') => {
    const buffer = audioEngine.getBuffer();
    if (!buffer) {
      alert('No audio to export. Please load and process a track first.');
      return;
    }

    try {
      console.log(`[Export] Starting ${format.toUpperCase()} export (${format === 'mp3' ? '320kbps' : 'lossless'})...`);

      const blob = format === 'mp3'
        ? await encoderService.exportAsMp3(buffer, 320)
        : await encoderService.exportAsWav(buffer);

      if (!blob || blob.size === 0) {
        throw new Error('Export produced an empty file');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mastered-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`[Export] ${format.toUpperCase()} export successful (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);

      // V.E.N.U.M. hook - trigger share prompt after export
      onExportComplete?.();
    } catch (error: any) {
      console.error(`[Export] ${format.toUpperCase()} export failed:`, error);
      alert(`Export failed: ${error.message || 'Unknown error'}. Please try again or use a different format.`);
    }
  };

  return (
    <div className={cn(glassCard, 'p-8 space-y-6 relative')}>
      <h2 className={cn(sectionHeader, 'text-2xl mb-2')}>Processing Controls</h2>
      <div className={gradientDivider} />

      {/* Metrics Comparison */}
      {processedMetrics && (
        <div className="grid grid-cols-2 gap-6 my-6">
          <div className={metricCard}>
            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Before</div>
            <div className="space-y-2">
              <div className="text-sm text-slate-300">
                RMS: <span className="font-mono font-bold text-slate-100">{originalMetrics.rms.toFixed(1)} dB</span>
              </div>
              {originalMetrics.lufs && (
                <div className="text-sm text-slate-300">
                  LUFS: <span className="font-mono font-bold text-slate-100">{originalMetrics.lufs.integrated.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-md border-2 border-orange-500/40 p-4 rounded-2xl shadow-[inset_2px_2px_6px_#050710,inset_-2px_-2px_6px_#0f1828]">
            <div className="text-xs text-orange-400 uppercase font-bold tracking-wider mb-3">After</div>
            <div className="space-y-2">
              <div className="text-sm text-slate-100">
                RMS: <span className="font-mono font-bold text-orange-300">{processedMetrics.rms.toFixed(1)} dB</span>
              </div>
              {processedMetrics.lufs && (
                <div className="text-sm text-slate-100">
                  LUFS: <span className="font-mono font-bold text-orange-300">{processedMetrics.lufs.integrated.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-4">
        <button
          onClick={onToggleAB}
          disabled={!hasAppliedChanges}
          className={cn(
            'w-full font-bold py-4 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2',
            !hasAppliedChanges
              ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed opacity-40 grayscale border border-slate-700/30'
              : 'bg-slate-900 text-slate-200 hover:text-white border border-slate-700/50 hover:border-orange-500/50 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] hover:shadow-[inset_1px_1px_3px_#050710,inset_-1px_-1px_3px_#0f1828]'
          )}
        >
          {!hasAppliedChanges ? 'A/B Compare (No Changes Yet)' : isAbComparing ? 'Listening to Original' : 'A/B Compare'}
        </button>

        <button
          onClick={handleCommit}
          disabled={isCommitting || !echoReport || echoReport.verdict === 'awaiting_analysis'}
          className={cn(
            glowButton,
            'w-full py-5 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2 font-black text-lg relative group'
          )}
          title={!echoReport || echoReport.verdict === 'awaiting_analysis' ? 'Run AI Analysis first to get recommendations' : ''}
        >
          {isCommitting ? 'Committing...' : 'Commit Changes'}
          {(!echoReport || echoReport.verdict === 'awaiting_analysis') && (
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-orange-400 text-xs px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Run AI Analysis first ↑
            </span>
          )}
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleExport('wav')}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-bold py-4 rounded-xl border border-slate-700/50 hover:border-slate-600 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] hover:shadow-[inset_1px_1px_3px_#050710,inset_-1px_-1px_3px_#0f1828] transition-all duration-300 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            WAV
          </button>
          <button
            onClick={() => handleExport('mp3')}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-bold py-4 rounded-xl border border-slate-700/50 hover:border-slate-600 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] hover:shadow-[inset_1px_1px_3px_#050710,inset_-1px_-1px_3px_#0f1828] transition-all duration-300 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            MP3
          </button>
        </div>
      </div>
    </div>
  );
};