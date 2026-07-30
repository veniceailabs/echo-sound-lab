import React, { useState, useEffect, useRef } from 'react';
import { AudioMetrics, ProcessingConfig, LiveProcessingConfig, ExportFormat, ReverbConfig, SaturationConfig, StereoImagerConfig, DynamicEQConfig, EQSettings, CompressionPreset, TransientShaperConfig, DeEsserConfig } from '../types';
import { audioEngine } from '../services/audioEngine';
import { exportMasterWithManifest } from '../services/masterExportService';
import { stemSeparationService } from '../services/stemSeparationService';
import { VocalDiagnosticsEngine, type VocalDiagnosticsReport } from '../audio/vocalDiagnostics';
import { applyPhraseRider } from '../audio/vocalRider';
import { MasteringGate } from '../audio/masteringGate';
import { applyMasteringChain, type TargetPlatform } from '../audio/masteringChain';
import { glassCard, glowButton, secondaryButton, metricCard, gradientDivider, sectionHeader, cn } from '../utils/secondLightStyles';

interface ProcessingPanelProps {
  originalMetrics: AudioMetrics;
  onCommit: (config: ProcessingConfig, appliedEchoAction?: any) => Promise<AudioMetrics | null>;
  onConfigChange: (config: LiveProcessingConfig) => void;
  onUserInteraction: () => void;
  isCommitting: boolean;
  processedMetrics: AudioMetrics | null;
  echoReport: any;
  onToggleAB: () => void;
  isAbComparing: boolean;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onExportComplete?: () => void; // V.E.N.U.M. hook
  hasAppliedChanges?: boolean;
  abLabel: string;
  abDisabled?: boolean;
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
  onUserInteraction,
  isCommitting,
  echoReport,
  isAbComparing,
  onToggleAB,
  isPlaying,
  onTogglePlayback,
  onExportComplete,
  hasAppliedChanges = false,
  abLabel,
  abDisabled,
  eqSettings,
  setEqSettings,
  dynamicEq,
  setDynamicEq,
}) => {
  // Compression disabled by default - modern tracks need surgical fixes, not blanket processing
  const [compression, setCompression] = useState<Partial<CompressionPreset>>({ threshold: -12, ratio: 1.0, attack: 0.005, release: 0.3, makeupGain: 0 });
  const [transient, setTransient] = useState<TransientShaperConfig>({ attack: 0, sustain: 0, mix: 1 });
  const [deEsser, setDeEsser] = useState<DeEsserConfig>({ frequency: 7000, threshold: -20, amount: 0 });
  const [saturation, setSaturation] = useState<SaturationConfig>({ type: 'tape', amount: 0, mix: 1 });
  const [reverb, setReverb] = useState<ReverbConfig>({ mix: 0, decay: 2.0, preDelay: 0.01, motion: { bpm: 120, depth: 0 }, duckingAmount: 0 });
  const [imager, setImager] = useState<StereoImagerConfig>({ lowWidth: 1, midWidth: 1, highWidth: 1, crossovers: [300, 5000] });
  const currentLiveConfig = useRef<LiveProcessingConfig>({});
  const lastEmittedConfigKeyRef = useRef<string | null>(null);
  // Changed NodeJS.Timeout to number for browser compatibility
  const configChangeTimeout = useRef<number | null>(null);

  // Phase 2: Vocal Engine Rebuild
  const [isExtractingVocals, setIsExtractingVocals] = useState(false);
  const [vocalStatus, setVocalStatus] = useState('');
  const [vocalReport, setVocalReport] = useState<VocalDiagnosticsReport | null>(null);

  // Phase 4: Discrete Mastering
  const [isMastering, setIsMastering] = useState(false);
  const [masteringStatus, setMasteringStatus] = useState('');
  const [compliancePassed, setCompliancePassed] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>('spotify');

  const handleMastering = async () => {
    const sourceBuffer = audioEngine.getProcessedBuffer() ?? audioEngine.getOriginalBuffer() ?? audioEngine.getBuffer();
    if (!sourceBuffer) {
      alert("No audio available to master. Please load and process a track first.");
      return;
    }
    
    setIsMastering(true);
    setCompliancePassed(false);
    
    try {
      setMasteringStatus('Running Mastering Gate Check...');
      const gate = new MasteringGate();
      const { adjustedBuffer, currentHeadroomDB } = await gate.verifyPremaster(sourceBuffer);
      
      setMasteringStatus(`Gate Passed: ${currentHeadroomDB.toFixed(1)}dB Headroom. Applying DSP Chain...`);
      const { masteredBuffer } = await applyMasteringChain(adjustedBuffer, targetPlatform);
      
      audioEngine.setProcessedBuffer(masteredBuffer);
      
      setCompliancePassed(true);
      setMasteringStatus('Mastering Complete! Platform Compliant.');
      
      setTimeout(() => setIsMastering(false), 3000);
    } catch (e: any) {
      console.error(e);
      setMasteringStatus(`Error: ${e.message}`);
      setTimeout(() => setIsMastering(false), 3000);
    }
  };

  const handleVocalExtraction = async () => {
    const sourceBuffer = audioEngine.getOriginalBuffer() ?? audioEngine.getBuffer();
    if (!sourceBuffer) {
      alert('Please load an audio file first.');
      return;
    }
    
    setIsExtractingVocals(true);
    setVocalStatus('Initializing HPSS...');
    setVocalReport(null);

    try {
      await stemSeparationService.initialize('esl-hpss');
      const { stems } = await stemSeparationService.processAudioFile(sourceBuffer, (state) => {
        setVocalStatus(`Extracting vocal stem: ${Math.round(state.progress)}%`);
      });

      if (!stems.vocals) throw new Error("Vocal stem extraction failed");

      setVocalStatus('Running Vocal Diagnostics...');
      const diagnosticsEngine = new VocalDiagnosticsEngine();
      const report = await diagnosticsEngine.analyze(stems.vocals);
      setVocalReport(report);

      setVocalStatus('Leveling vocal phrases...');
      const leveledVocal = await applyPhraseRider(stems.vocals, -14);
      
      audioEngine.setBuffer(leveledVocal);
      
      setVocalStatus('Vocal processing complete!');
      // Let it stay visible for a bit
      setTimeout(() => setIsExtractingVocals(false), 4000);

    } catch (err: any) {
      console.error(err);
      setVocalStatus(`Error: ${err.message}`);
      setTimeout(() => setIsExtractingVocals(false), 4000);
    }
  };

  useEffect(() => {
    const compressionActive = (compression.ratio ?? 1) > 1.01 || (compression.makeupGain ?? 0) !== 0;
    const width = (imager.lowWidth + imager.midWidth + imager.highWidth) / 3;
    const normalizedImager: StereoImagerConfig = {
        lowWidth: width,
        midWidth: width,
        highWidth: width,
        crossovers: imager.crossovers,
    };
    const config: LiveProcessingConfig = {
        compression: compressionActive ? compression : undefined,
        eq: eqSettings.some(b => b.gain !== 0) ? eqSettings : undefined,
        transientShaper: transient.attack !== 0 || transient.sustain !== 0 || transient.mix !== 1 ? transient : undefined,
        deEsser: deEsser.amount > 0 ? deEsser : undefined,
        saturation: saturation.amount > 0 || saturation.mix !== 1 ? saturation : undefined,
        motionReverb: reverb.mix > 0 ? reverb : undefined,
        stereoImager: width !== 1 ? normalizedImager : undefined,
        dynamicEq: dynamicEq.filter(b => b.enabled).length > 0 ? dynamicEq : undefined
    };
    currentLiveConfig.current = config;

    const configKey = JSON.stringify(config);
    if (lastEmittedConfigKeyRef.current === null) {
      lastEmittedConfigKeyRef.current = configKey;
      return;
    }
    if (lastEmittedConfigKeyRef.current === configKey) {
      return;
    }

    // Debounce config changes to prevent spam - only update when user stops adjusting
    if (configChangeTimeout.current) {
      clearTimeout(configChangeTimeout.current);
    }
    if (isAbComparing) {
      return;
    }
    configChangeTimeout.current = setTimeout(() => {
      if (!isAbComparing) {
        onConfigChange(config);
        lastEmittedConfigKeyRef.current = configKey;
      }
    }, 50); // 50ms debounce for snappier real-time response

    return () => {
      if (configChangeTimeout.current) {
        clearTimeout(configChangeTimeout.current);
      }
    };
  }, [eqSettings, transient, deEsser, saturation, reverb, imager, dynamicEq, compression, onConfigChange, isAbComparing]);

  const handleCommit = () => {
    onCommit(currentLiveConfig.current, undefined);
  };

  const handleExport = async (format: 'wav' | 'mp3' = 'wav') => {
    const sourceBuffer = audioEngine.getOriginalBuffer() ?? audioEngine.getBuffer();
    if (!sourceBuffer) {
      alert('No audio to export. Please load and process a track first.');
      return;
    }

    try {
      console.log(`[Export] Starting ${format.toUpperCase()} export (${format === 'mp3' ? '320kbps' : 'lossless'})...`);
      const audioFileName = `mastered-${Date.now()}.${format}`;
      const result = await exportMasterWithManifest({
        processedBuffer: audioEngine.getProcessedBuffer(),
        sourceBuffer,
        config: currentLiveConfig.current as ProcessingConfig,
        format,
        audioFileName,
        creatorId: 'human:processing-panel',
      });

      console.log(`[Export] ${format.toUpperCase()} export successful`, {
        source: result.source,
        manifestHash: result.signedManifest.manifestHash,
      });

      // V.E.N.U.M. hook - trigger share prompt after export
      onExportComplete?.();
    } catch (error: any) {
      console.error(`[Export] ${format.toUpperCase()} export failed:`, error);
      alert(`Export failed: ${error.message || 'Unknown error'}. Please try again or use a different format.`);
    }
  };

  return (
    <div
      className={cn(glassCard, 'p-8 space-y-6 relative')}
      onPointerDown={onUserInteraction}
      onKeyDown={onUserInteraction}
    >
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
        
        {/* Phase 2: Vocal Pre-flight */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4 mb-6">
          <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Vocal Pre-Flight</h3>
          {!isExtractingVocals && !vocalReport && (
            <button
              onClick={handleVocalExtraction}
              className="w-full bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-bold py-3 rounded-xl border border-slate-700/50 hover:border-orange-500/50 transition-all duration-300 text-xs uppercase tracking-wider"
            >
              Isolate & Level Vocals
            </button>
          )}
          {isExtractingVocals && (
            <div className="text-center py-4">
              <div className="animate-pulse text-orange-400 font-bold mb-2">{vocalStatus}</div>
              {vocalReport && (
                <div className="text-left mt-4 text-xs space-y-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  <div className={vocalReport.hasPlosives ? 'text-red-400' : 'text-emerald-400'}>
                    • Plosives: {vocalReport.hasPlosives ? `Detected (${(vocalReport.plosiveSeverity * 100).toFixed(0)}%)` : 'Clear'}
                  </div>
                  <div className={vocalReport.needsDeEssing ? 'text-yellow-400' : 'text-emerald-400'}>
                    • Sibilance: {vocalReport.needsDeEssing ? `Detected (${(vocalReport.sibilanceSeverity * 100).toFixed(0)}%)` : 'Clear'}
                  </div>
                  <div className={vocalReport.highNoiseFloor ? 'text-red-400' : 'text-emerald-400'}>
                    • Noise Floor: {vocalReport.noiseFloorDb.toFixed(1)} dB
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onToggleAB}
          disabled={abDisabled ?? !hasAppliedChanges}
          className={cn(
            'w-full font-bold py-4 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2',
            (abDisabled ?? !hasAppliedChanges)
              ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed opacity-40 grayscale border border-slate-700/30'
              : 'bg-slate-900 text-slate-200 hover:text-white border border-slate-700/50 hover:border-orange-500/50 shadow-[3px_3px_6px_#050710,-3px_-3px_6px_#0f1828] hover:shadow-[inset_1px_1px_3px_#050710,inset_-1px_-1px_3px_#0f1828]'
          )}
        >
          {abLabel}
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

        {/* Phase 4: Mastering & Delivery */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4 mb-6 mt-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Delivery Specifications</h3>
            <select 
              value={targetPlatform} 
              onChange={(e) => setTargetPlatform(e.target.value as TargetPlatform)}
              className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 outline-none text-slate-300"
            >
              <option value="spotify">Spotify (-14 LUFS)</option>
              <option value="apple">Apple Music (-16 LUFS)</option>
              <option value="club">Club (-9 LUFS)</option>
            </select>
          </div>
          
          {!isMastering && !compliancePassed && (
             <button
               onClick={handleMastering}
               className="w-full bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-bold py-3 rounded-xl border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 text-xs uppercase tracking-wider"
             >
               Run Mastering Chain
             </button>
          )}

          {isMastering && (
            <div className="text-center py-4">
              <div className="animate-pulse text-blue-400 font-bold text-xs">{masteringStatus}</div>
            </div>
          )}

          {compliancePassed && !isMastering && (
            <div className="space-y-4">
               <div className="text-xs space-y-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  <div className="text-emerald-400 flex justify-between">
                    <span>{targetPlatform === 'spotify' ? 'Spotify' : targetPlatform === 'apple' ? 'Apple Music' : 'Club'} Target</span>
                    <span>✅ COMPLIANT</span>
                  </div>
                  <div className="text-slate-400 pl-2">-1.0 dBTP Ceiling Maintained</div>
                  <div className="text-slate-400 pl-2">Glue Compression & Harmonics Applied</div>
               </div>
               
               <button
                 onClick={() => handleExport('wav')}
                 className="w-full bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 hover:text-white font-bold py-4 rounded-xl border border-emerald-500/50 transition-all duration-300 flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.2)]"
               >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                 </svg>
                 Download Distro-Ready Master
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
