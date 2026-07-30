import React, { useMemo, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { ABProofCarousel } from './ABProofCarousel';
import { LUFSGraph } from './LUFSGraph';
import { ProcessingChainInsights } from './ProcessingChainInsights';
import { MasteringAdvice } from './MasteringAdvice';
import { ProofShareDialog } from './ProofShareDialog';
import type { AudioMetrics, ABVariant } from '../types';

interface ProofLayerProps {
  originalBuffer: AudioBuffer;
  processedBuffer: AudioBuffer;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  variant: ABVariant;
  onProofModeOpened?: () => void;
}

/**
 * ProofLayer: Visual before/after evidence system
 * Shows waveform + spectrum + LUFS transformation
 * User toggles and sees proof that ESL actually did something
 */

const deriveWaveformSummary = (buffer: AudioBuffer, maxWidth: number = 800): number[] => {
  const channelCount = buffer.numberOfChannels;
  const samplesPerPixel = Math.ceil(buffer.length / maxWidth);
  const summary: number[] = [];

  for (let px = 0; px < maxWidth; px++) {
    const start = px * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, buffer.length);
    let peak = 0;

    for (let ch = 0; ch < channelCount; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
    }

    summary.push(peak);
  }

  return summary;
};

const computeSpectrumSnapshot = async (buffer: AudioBuffer): Promise<number[]> => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;

  const analyser = offlineCtx.createAnalyser();
  analyser.fftSize = 256; // 128 bins
  source.connect(analyser);
  analyser.connect(offlineCtx.destination);
  source.start(0);

  await offlineCtx.startRendering();

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freqData);

  return Array.from(freqData).map(val => val / 255);
};

const smoothSpectrum = (spectrum: number[], windowSize: number = 3): number[] => {
  if (spectrum.length < windowSize) return spectrum;

  return spectrum.map((_, i) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(spectrum.length, i + Math.ceil(windowSize / 2));
    const sum = spectrum.slice(start, end).reduce((a, b) => a + b, 0);
    return sum / (end - start);
  });
};

interface WaveformVisualizerProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  data,
  color,
  width = 400,
  height = 100,
}) => {
  const points = data
    .map((peak, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height / 2 - (peak * (height / 2));
      return `${x},${y}`;
    })
    .join(' ');

  const pointsRev = data
    .map((peak, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height / 2 + (peak * (height / 2));
      return `${x},${y}`;
    })
    .reverse()
    .join(' ');

  const fullPath = points + ' ' + pointsRev;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={fullPath}
        fill={color}
        fillOpacity="0.4"
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
};

interface SpectrumVisualizerProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
  data,
  color,
  width = 400,
  height = 100,
}) => {
  const barWidth = Math.max(1, Math.floor(width / data.length));
  const spacing = Math.max(0, Math.floor((width - barWidth * data.length) / data.length));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {data.map((val, i) => {
        const x = i * (barWidth + spacing);
        const barHeight = val * (height * 0.9);
        const y = height - barHeight;

        return (
          <motion.rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={color}
            fillOpacity="0.8"
            initial={{ height: 0, y: height }}
            animate={{ height: barHeight, y }}
            transition={{
              duration: 0.2,
              ease: 'easeOut',
              delay: i * 0.02,
            }}
          />
        );
      })}
    </svg>
  );
};

interface MetricCardProps {
  label: string;
  originalValue: number;
  processedValue: number;
  unit: string;
  higherIsBetter: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  originalValue,
  processedValue,
  unit,
  higherIsBetter,
}) => {
  const motionValue = useMotionValue(originalValue);
  const displayValue = useTransform(motionValue, v => v.toFixed(1));

  useEffect(() => {
    animate(motionValue, processedValue, { duration: 1.2, delay: 0.1 });
  }, [processedValue, motionValue]);

  const improved = higherIsBetter
    ? processedValue > originalValue
    : processedValue < originalValue;
  const changed = Math.abs(processedValue - originalValue) > 0.01;

  return (
    <motion.div
      className="flex flex-col items-center p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <motion.p className="text-lg font-bold text-cyan-400 flex items-center gap-1">
        <span>{displayValue}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </motion.p>
      <p className={`text-xs mt-1 font-semibold ${
        changed
          ? improved
            ? 'text-emerald-400'
            : 'text-slate-400'
          : 'text-slate-600'
      }`}>
        {changed ? (improved ? 'â†improved' : 'â†optimized') : 'â†no change'}
      </p>
    </motion.div>
  );
};

export const ProofLayer: React.FC<ProofLayerProps> = ({
  originalBuffer,
  processedBuffer,
  originalMetrics,
  processedMetrics,
  variant,
  onProofModeOpened,
}) => {
  const [spectrum, setSpectrum] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const originalWaveform = useMemo(
    () => deriveWaveformSummary(originalBuffer),
    [originalBuffer]
  );

  const processedWaveform = useMemo(
    () => deriveWaveformSummary(processedBuffer),
    [processedBuffer]
  );

  useEffect(() => {
    const fetchSpectrum = async () => {
      try {
        const raw = await computeSpectrumSnapshot(processedBuffer);
        const smoothed = smoothSpectrum(raw);
        setSpectrum(smoothed);
      } catch (err) {
        console.warn('[ProofLayer] Spectrum computation failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSpectrum();
  }, [processedBuffer]);

  const originalLUFS = originalMetrics?.lufs?.integrated ?? 0;
  const processedLUFS = processedMetrics?.lufs?.integrated ?? 0;

  const procLufsMotion = useMotionValue(originalLUFS);
  const procLufsDisplay = useTransform(procLufsMotion, v => v.toFixed(1));

  useEffect(() => {
    animate(procLufsMotion, processedLUFS, { duration: 1.4, delay: 0.2 });
  }, [processedLUFS, procLufsMotion]);

  // Generate LUFS progression for visualization
  const lufsGraphData = useMemo(() => {
    const steps = 20;
    const data = [];
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      data.push({
        time: progress * 30, // 30 seconds mastering duration
        original: originalLUFS,
        processed: originalLUFS + (processedLUFS - originalLUFS) * Math.pow(progress, 0.8),
      });
    }
    return data;
  }, [originalLUFS, processedLUFS]);

  return (
    <motion.div
      className="proof-layer space-y-6 p-6 bg-gradient-to-br from-slate-900/40 to-slate-800/20 rounded-lg border border-cyan-500/20"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      data-testid="proof-layer"
    >
      {/* LUFS Counter Animation â€Sprint 4 */}
      <div className="lufs-section">
        <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-4">Loudness Transformation</h4>
        <div className="flex items-center justify-between gap-4">
          <motion.div
            className="text-center flex-1"
            initial={{ opacity: 0, translateY: 4 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <p className="text-2xl font-bold text-slate-300">{originalLUFS.toFixed(1)}</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Original LUFS</p>
          </motion.div>

          <motion.div
            className="text-slate-400 text-xl"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 }}
          >
            â†’
          </motion.div>

          <motion.div
            className="text-center flex-1"
            initial={{ opacity: 0, translateY: 4 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 }}
          >
            <motion.p
              className="text-2xl font-bold text-cyan-400"
              key="processed-lufs"
            >
              {procLufsDisplay}
            </motion.p>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Mastered LUFS</p>
          </motion.div>
        </div>
      </div>

      {/* Animated Metric Cards â€Sprint 4 */}
      <motion.div
        className="grid grid-cols-3 gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <MetricCard
          label="Dynamic Range"
          originalValue={originalMetrics?.lufs?.loudnessRange ?? 0}
          processedValue={processedMetrics?.lufs?.loudnessRange ?? 0}
          unit="LU"
          higherIsBetter
        />
        <MetricCard
          label="True Peak"
          originalValue={originalMetrics?.lufs?.truePeak ?? 0}
          processedValue={processedMetrics?.lufs?.truePeak ?? 0}
          unit="dBTP"
          higherIsBetter={false}
        />
        <MetricCard
          label="Stereo Width"
          originalValue={originalMetrics?.advancedMetrics?.stereoWidth ?? 0}
          processedValue={processedMetrics?.advancedMetrics?.stereoWidth ?? 0}
          unit="%"
          higherIsBetter
        />
      </motion.div>

      {/* T2: LUFS Graph */}
      <LUFSGraph data={lufsGraphData} width={400} height={150} isLive={false} />

      {/* T2: Processing Chain Insights */}
      <ProcessingChainInsights
        stages={[]}
        totalLUFSImprovement={Math.abs(processedLUFS - originalLUFS)}
        totalPeakReduction={Math.abs((processedMetrics?.lufs?.truePeak ?? 0) - (originalMetrics?.lufs?.truePeak ?? 0))}
      />

      {/* T2: AI Mastering Advice */}
      <MasteringAdvice lufs={processedLUFS} defaultGenre="Pop" />

      {/* T2: Share Button */}
      <motion.button
        onClick={() => setShowShareDialog(true)}
        className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-slate-200 font-semibold uppercase tracking-widest border border-purple-400/30 hover:border-pink-400/50 transition-all"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        ðŸ”Share Proof with QR Code
      </motion.button>

      {/* Waveform Comparison â€Sprint 4 Fade */}
      <div className="waveform-section">
        <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-4">Waveform Comparison</h4>
        <div className="space-y-4">
          <ABProofCarousel
            originalWaveform={originalWaveform}
            processedWaveform={processedWaveform}
            originalBuffer={originalBuffer}
            processedBuffer={processedBuffer}
            width={400}
            height={100}
          />

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <p className="text-xs text-slate-500 mb-2">Original</p>
              <WaveformVisualizer data={originalWaveform} color="rgb(100, 116, 139)" width={180} height={40} />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut', delay: 0.25 }}
            >
              <p className="text-xs text-slate-500 mb-2">Mastered</p>
              <WaveformVisualizer data={processedWaveform} color="rgb(34, 211, 238)" width={180} height={40} />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Spectrum Reveal â€Sprint 4 Stagger */}
      {!loading && spectrum && (
        <motion.div
          className="spectrum-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-4">Frequency Spectrum (Locked In)</h4>
          <SpectrumVisualizer data={spectrum} color="rgb(59, 130, 246)" width={400} height={80} />
        </motion.div>
      )}

      {loading && (
        <div className="spectrum-section text-xs text-slate-500">Computing spectrum...</div>
      )}

      {/* Variant Info */}
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <p className="text-xs text-slate-500">
          Variant: <span className="text-cyan-400 font-semibold">{variant.toUpperCase()}</span>
        </p>
      </div>

      {/* T2: Share Dialog */}
      <ProofShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        trackName="Your Track"
        originalMetrics={originalMetrics}
        processedMetrics={processedMetrics}
      />
    </motion.div>
  );
};

export default ProofLayer;
