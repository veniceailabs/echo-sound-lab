import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeReference, applyReferenceMatch, generateReferenceReport } from '../../services/referenceMatchingEngine';
import { mixAnalysisService } from '../../services/mixAnalysis';
import { lufsMeteringService } from '../../services/lufsMetering';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import type { AudioMetrics } from '../../types';

interface ReferenceMatchingPanelProps {
  userMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  onMatchApplied?: (report: string) => void;
}

export const ReferenceMatchingPanel: React.FC<ReferenceMatchingPanelProps> = ({
  userMetrics,
  processedMetrics,
  onMatchApplied,
}) => {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceMetrics, setReferenceMetrics] = useState<AudioMetrics | null>(null);
  const [matchReport, setMatchReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!FEATURE_FLAGS.SHOW_REFERENCE_MATCHING_EXPERIMENTS) {
    return (
      <motion.div
        className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Reference matching</p>
        <p className="text-sm text-slate-300">
          This mastering preview stays hidden until reference analysis is enabled in the studio surface.
        </p>
      </motion.div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setReferenceFile(file);

    try {
      const buffer = await file.arrayBuffer();
      const offline = await new AudioContext().decodeAudioData(buffer.slice(0));
      const staticMetrics = mixAnalysisService.analyzeStaticMetrics(offline);
      const loudness = await lufsMeteringService.measureLUFS(offline);

      const referenceMetrics = {
        lufs: {
          integrated: loudness.integratedLUFS,
          shortTerm: loudness.shortTermLUFS,
          momentary: loudness.momentaryLUFS,
          loudnessRange: loudness.loudnessRange,
          truePeak: loudness.truePeak,
        },
        advancedMetrics: {
          stereoWidth: Math.round(Math.max(0, Math.min(100, (1 - Math.abs((staticMetrics.advancedMetrics?.phaseCoherence ?? 50) / 100)) * 100))),
        },
      } as AudioMetrics;

      setReferenceMetrics(referenceMetrics);

      const analysis = analyzeReference(referenceMetrics, file.name);
      const match = applyReferenceMatch(
        processedMetrics?.lufs?.integrated ?? -14,
        userMetrics,
        analysis
      );
      const report = generateReferenceReport(match);
      setMatchReport(report);

      onMatchApplied?.(report);
    } catch (error) {
      setMatchReport(`Reference analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h4 className="text-sm font-bold text-slate-100 mb-2">Master Reference Matching</h4>
        <p className="text-xs text-slate-400 mb-4">Upload a favorite professionally mastered track. ESL will analyze and apply its characteristics.</p>
      </div>

      {/* File Upload */}
      <motion.label className="block" whileHover={{ scale: 1.02 }}>
        <input
          type="file"
          accept="audio/wav,audio/mp3,audio/flac"
          onChange={handleFileUpload}
          disabled={loading}
          className="hidden"
        />
        <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
          loading
            ? 'bg-slate-800/50 border-slate-600/50'
            : referenceFile
              ? 'bg-emerald-500/10 border-emerald-400/50'
              : 'bg-slate-900/50 border-slate-700/50 hover:border-cyan-400/50'
        }`}>
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block text-3xl"
            >
              ⏳
            </motion.div>
          ) : referenceFile ? (
            <>
              <p className="text-sm font-semibold text-emerald-300">Reference loaded</p>
              <p className="text-xs text-emerald-400 mt-1">{referenceFile.name}</p>
            </>
          ) : (
            <>
              <p className="text-2xl mb-2">🎵</p>
              <p className="text-sm font-semibold text-slate-300">Upload reference track</p>
              <p className="text-xs text-slate-500 mt-1">WAV, MP3, or FLAC</p>
            </>
          )}
        </div>
      </motion.label>

      {/* Analysis Result */}
      <AnimatePresence>
        {matchReport && (
          <motion.div
            className="p-4 rounded-lg bg-blue-500/10 border border-blue-400/30 font-mono text-xs text-blue-200"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{matchReport}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reference Characteristics */}
      {referenceMetrics && (
        <motion.div
          className="grid grid-cols-2 gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Reference LUFS</p>
            <p className="text-lg font-bold text-cyan-400">{referenceMetrics.lufs?.integrated?.toFixed(1)}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Loudness Range</p>
            <p className="text-lg font-bold text-orange-400">{referenceMetrics.lufs?.loudnessRange?.toFixed(1)} LU</p>
          </div>
        </motion.div>
      )}

      <motion.div
        className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Reference matching analyzes your favorite master's loudness, EQ, and compression character, then applies it to your track.
      </motion.div>
    </motion.div>
  );
};
