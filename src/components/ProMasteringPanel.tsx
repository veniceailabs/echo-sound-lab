import React, { useEffect, useRef, useState } from 'react';
import './ProMasteringPanel.css';
import ProofPlayer from './ProofPlayer';
import { audioEngine } from '../services/audioEngine';
import { encoderService } from '../services/encoderService';
import { lufsMeteringService } from '../services/lufsMetering';
import { mixAnalysisService } from '../services/mixAnalysis';
import { exportMasterWithManifest } from '../services/masterExportService';
import type { ProcessingConfig } from '../types';

interface MasteringParams {
  genre: 'hip-hop' | 'pop' | 'indie' | 'rnb' | 'default';
  style: 'conservative' | 'balanced' | 'bright' | 'warm' | 'punchy';
  targetLoudness: number;
}

interface AudioAnalysis {
  integrated_loudness: number;
  true_peak: number;
  loudness_range: number;
  dynamic_range: number;
  crest_factor: number;
  frequency_content: number[];
  spectral_centroid: number;
  zero_crossing_rate: number;
  artifacts: { clipping_percent: number; noise_floor_db: number };
}

interface PremasterCheckpoint {
  checkpoint_id: string;
  generated_at: string;
  approved_for_mastering: boolean;
  manifest_hash: string;
  requirements: {
    no_clipping: boolean;
    headroom_ok: boolean;
    lra_ok: boolean;
  };
  blocking_reasons: string[];
  metrics: {
    integrated_lufs: number;
    true_peak_db: number;
    sample_peak_db: number;
    loudness_range_lu: number;
    headroom_db: number;
  };
}

interface MasteringResult {
  metadata: {
    integrated_loudness: number;
    true_peak: number;
    loudness_range: number;
    dynamic_range: number;
    spectral_centroid: number;
    processing_chain_stages: number;
    quality_score: number;
    genre: string;
    style: string;
    reference_matched: boolean;
  };
  beforeAnalysis: AudioAnalysis;
  afterAnalysis: AudioAnalysis;
}

interface RenderArtifacts {
  sourceBuffer: AudioBuffer;
  masteredBuffer: AudioBuffer;
  processingConfig: ProcessingConfig;
  audioFileName: string;
  beforePreviewUrl: string;
  afterPreviewUrl: string;
}

const PREMASTER_TRUE_PEAK_TARGET = -6.0;
const PREMASTER_MIN_LRA = 6.0;
const MASTER_EXPORT_CREATOR = 'human:pro-mastering-panel';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dbToLinear(value: number): number {
  return Math.pow(10, value / 20);
}

function countProcessingStages(config: ProcessingConfig): number {
  return [
    config.eq?.some((band) => band.gain !== 0),
    config.compression,
    config.deEsser?.amount && config.deEsser.amount > 0,
    config.dynamicEq?.some((band) => band.enabled),
    config.saturation?.amount && config.saturation.amount > 0,
    config.motionReverb?.mix && config.motionReverb.mix > 0,
    config.stereoImager,
    config.limiter,
  ].filter(Boolean).length;
}

function estimateNoiseFloorDb(buffer: AudioBuffer): number {
  const channelData = buffer.getChannelData(0);
  if (!channelData.length) return -96;
  const windowSize = Math.max(512, Math.floor(buffer.sampleRate * 0.05));
  let minRms = Number.POSITIVE_INFINITY;

  for (let start = 0; start < channelData.length; start += windowSize) {
    const end = Math.min(channelData.length, start + windowSize);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    if (rms > 0 && rms < minRms) minRms = rms;
  }

  if (!Number.isFinite(minRms) || minRms <= 0) return -96;
  return 20 * Math.log10(minRms);
}

function estimateSpectralCentroid(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  if (!data.length) return 0;
  const fftSize = Math.min(4096, 2 ** Math.floor(Math.log2(data.length)));
  const real = data.slice(0, fftSize);
  let weightedSum = 0;
  let magnitudeSum = 0;

  for (let k = 0; k < fftSize / 2; k += 1) {
    let realPart = 0;
    let imagPart = 0;
    for (let n = 0; n < fftSize; n += 1) {
      const phase = (2 * Math.PI * k * n) / fftSize;
      realPart += real[n] * Math.cos(phase);
      imagPart -= real[n] * Math.sin(phase);
    }
    const magnitude = Math.sqrt(realPart * realPart + imagPart * imagPart);
    const frequency = (k * buffer.sampleRate) / fftSize;
    weightedSum += magnitude * frequency;
    magnitudeSum += magnitude;
  }

  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

function estimateZeroCrossingRate(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  if (data.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < data.length; i += 1) {
    const prev = data[i - 1];
    const current = data[i];
    if ((prev >= 0 && current < 0) || (prev < 0 && current >= 0)) {
      crossings += 1;
    }
  }
  return crossings / data.length;
}

function cloneAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const cloned = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    cloned.getChannelData(channel).set(buffer.getChannelData(channel));
  }

  return cloned;
}

function applyGainInPlace(buffer: AudioBuffer, gainDb: number): void {
  const gain = dbToLinear(gainDb);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      data[i] *= gain;
    }
  }
}

function buildStyleConfig(style: MasteringParams['style'], targetLoudness: number): ProcessingConfig {
  const shared: ProcessingConfig = {
    targetLufs: targetLoudness,
    limiter: { threshold: -1.05, release: 0.14 },
    outputTrimDb: 0,
  };

  switch (style) {
    case 'conservative':
      return {
        ...shared,
        compression: { threshold: -18, ratio: 1.4, attack: 0.02, release: 0.18, makeupGain: 0.4 },
      };
    case 'bright':
      return {
        ...shared,
        eq: [
          { type: 'highshelf', frequency: 8200, gain: 1.8, q: 0.7 },
          { type: 'peaking', frequency: 3200, gain: 1.1, q: 1.1 },
        ],
        compression: { threshold: -16, ratio: 1.85, attack: 0.012, release: 0.12, makeupGain: 0.8 },
        saturation: { type: 'tube', amount: 0.1, mix: 0.7 },
      };
    case 'warm':
      return {
        ...shared,
        eq: [
          { type: 'lowshelf', frequency: 180, gain: 1.2, q: 0.7 },
          { type: 'highshelf', frequency: 7200, gain: -0.8, q: 0.7 },
        ],
        compression: { threshold: -17, ratio: 1.65, attack: 0.015, release: 0.16, makeupGain: 0.6 },
        saturation: { type: 'tape', amount: 0.14, mix: 0.72 },
      };
    case 'punchy':
      return {
        ...shared,
        compression: { threshold: -14.5, ratio: 2.2, attack: 0.008, release: 0.1, makeupGain: 1.0 },
        transientShaper: { attack: 0.18, sustain: -0.05, mix: 0.7 },
        saturation: { type: 'transformer', amount: 0.12, mix: 0.68 },
      };
    case 'balanced':
    default:
      return {
        ...shared,
        compression: { threshold: -16, ratio: 1.75, attack: 0.014, release: 0.14, makeupGain: 0.6 },
        saturation: { type: 'tape', amount: 0.08, mix: 0.55 },
      };
  }
}

function mergeConfigs(base: ProcessingConfig, styleConfig: ProcessingConfig): ProcessingConfig {
  return {
    ...base,
    ...styleConfig,
    eq: [...(base.eq || []), ...(styleConfig.eq || [])],
    dynamicEq: styleConfig.dynamicEq || base.dynamicEq,
    compression: { ...(base.compression || {}), ...(styleConfig.compression || {}) },
    limiter: styleConfig.limiter || base.limiter,
    saturation: styleConfig.saturation || base.saturation,
    transientShaper: styleConfig.transientShaper || base.transientShaper,
    motionReverb: styleConfig.motionReverb || base.motionReverb,
    stereoImager: styleConfig.stereoImager || base.stereoImager,
  };
}

function scoreMastering(
  targetLoudness: number,
  afterAnalysis: AudioAnalysis,
  beforeAnalysis: AudioAnalysis,
): number {
  let score = 100;
  score -= Math.abs(afterAnalysis.integrated_loudness - targetLoudness) * 5.5;
  score -= Math.max(0, afterAnalysis.true_peak + 1.0) * 18;
  score -= Math.max(0, 3.5 - afterAnalysis.loudness_range) * 5;
  score -= Math.max(0, afterAnalysis.artifacts.clipping_percent - 0.01) * 220;
  score += clamp(afterAnalysis.dynamic_range - beforeAnalysis.dynamic_range, -2, 2) * 2;
  return clamp(Number(score.toFixed(1)), 0, 100);
}

async function digestHex(parts: Array<string | ArrayBuffer>): Promise<string> {
  const encoder = new TextEncoder();
  const buffers = parts.map((part) => {
    if (typeof part === 'string') return encoder.encode(part);
    return new Uint8Array(part);
  });
  const totalLength = buffers.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of buffers) {
    merged.set(part, offset);
    offset += part.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', merged);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

export const ProMasteringPanel: React.FC<{ onMasteringComplete?: (url: string) => void }> = ({
  onMasteringComplete,
}) => {
  const [vocalFile, setVocalFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [params, setParams] = useState<MasteringParams>({
    genre: 'default',
    style: 'balanced',
    targetLoudness: -14,
  });
  const [changeRequest, setChangeRequest] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<MasteringResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [beforeSpectrumUrl, setBeforeSpectrumUrl] = useState<string | null>(null);
  const [afterSpectrumUrl, setAfterSpectrumUrl] = useState<string | null>(null);
  const [premasterCheckpoint, setPremasterCheckpoint] = useState<PremasterCheckpoint | null>(null);
  const [premasterApprovedAt, setPremasterApprovedAt] = useState<string | null>(null);
  const [renderArtifacts, setRenderArtifacts] = useState<RenderArtifacts | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    setPremasterCheckpoint(null);
    setPremasterApprovedAt(null);
    setResult(null);
    setBeforeSpectrumUrl(null);
    setAfterSpectrumUrl(null);
    if (renderArtifacts) {
      URL.revokeObjectURL(renderArtifacts.beforePreviewUrl);
      URL.revokeObjectURL(renderArtifacts.afterPreviewUrl);
      setRenderArtifacts(null);
    }
  }, [vocalFile, referenceFile, params.genre, params.style, params.targetLoudness, changeRequest]);

  useEffect(() => {
    return () => {
      if (renderArtifacts) {
        URL.revokeObjectURL(renderArtifacts.beforePreviewUrl);
        URL.revokeObjectURL(renderArtifacts.afterPreviewUrl);
      }
    };
  }, [renderArtifacts]);

  const decodeAudioFile = async (file: File): Promise<AudioBuffer> => {
    const context = audioContextRef.current;
    if (!context) {
      throw new Error('Audio context is unavailable');
    }
    const bytes = await file.arrayBuffer();
    return context.decodeAudioData(bytes.slice(0));
  };

  const analyzeBuffer = async (buffer: AudioBuffer): Promise<AudioAnalysis> => {
    const loudness = await lufsMeteringService.measureLUFS(buffer);
    const staticMetrics = mixAnalysisService.analyzeStaticMetrics(buffer);
    const channel = buffer.getChannelData(0);
    let clipped = 0;
    for (let i = 0; i < channel.length; i += 1) {
      if (Math.abs(channel[i]) >= 0.9999) clipped += 1;
    }
    return {
      integrated_loudness: loudness.integratedLUFS,
      true_peak: loudness.truePeak,
      loudness_range: loudness.loudnessRange,
      dynamic_range: staticMetrics.crestFactor,
      crest_factor: staticMetrics.crestFactor,
      frequency_content: [],
      spectral_centroid: estimateSpectralCentroid(buffer),
      zero_crossing_rate: estimateZeroCrossingRate(buffer),
      artifacts: {
        clipping_percent: channel.length > 0 ? clipped / channel.length : 0,
        noise_floor_db: estimateNoiseFloorDb(buffer),
      },
    };
  };

  const generateSpectrum = async (buffer: AudioBuffer, accent: string): Promise<string> => {
    const downmixed = buffer.getChannelData(0);
    const fftSize = Math.min(2048, 2 ** Math.floor(Math.log2(Math.max(32, downmixed.length))));
    const bandCount = 96;
    const magnitudes = new Array<number>(bandCount).fill(0);
    for (let band = 0; band < bandCount; band += 1) {
      const start = Math.floor((band / bandCount) * fftSize);
      const end = Math.max(start + 1, Math.floor(((band + 1) / bandCount) * fftSize));
      let sum = 0;
      for (let i = start; i < end; i += 1) {
        const sample = downmixed[i] ?? 0;
        sum += sample * sample;
      }
      magnitudes[band] = Math.sqrt(sum / Math.max(1, end - start));
    }

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, `${accent}11`);
    gradient.addColorStop(0.5, `${accent}44`);
    gradient.addColorStop(1, `${accent}11`);
    ctx.fillStyle = '#060816';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = canvas.width / bandCount;
    magnitudes.forEach((value, index) => {
      const normalized = clamp(value * 18, 0.04, 1);
      const height = normalized * canvas.height * 0.86;
      const x = index * barWidth;
      const y = canvas.height - height;
      ctx.fillStyle = `${accent}${index % 2 === 0 ? 'cc' : '88'}`;
      ctx.fillRect(x + 1, y, Math.max(2, barWidth - 2), height);
    });

    return canvas.toDataURL('image/png');
  };

  const buildPremasterCheckpoint = async (file: File, buffer: AudioBuffer): Promise<PremasterCheckpoint> => {
    const fileBytes = await file.arrayBuffer();
    const analysis = await analyzeBuffer(buffer);
    const samplePeakDb = mixAnalysisService.analyzeStaticMetrics(buffer).peak;
    const manifestHash = await digestHex([
      fileBytes,
      JSON.stringify({
        name: file.name,
        size: file.size,
        genre: params.genre,
        style: params.style,
        targetLoudness: params.targetLoudness,
        changeRequest,
      }),
    ]);
    const headroomDb = PREMASTER_TRUE_PEAK_TARGET - analysis.true_peak;
    const requirements = {
      no_clipping: analysis.artifacts.clipping_percent === 0 && analysis.true_peak < 0,
      headroom_ok: headroomDb >= 0,
      lra_ok: analysis.loudness_range >= PREMASTER_MIN_LRA,
    };
    const blockingReasons: string[] = [];
    if (!requirements.no_clipping) blockingReasons.push('Premaster clips before mastering. Pull the level down first.');
    if (!requirements.headroom_ok) blockingReasons.push(`Premaster true peak is ${analysis.true_peak.toFixed(2)} dBTP. Leave at least 6 dB of headroom.`);
    if (!requirements.lra_ok) blockingReasons.push(`Premaster loudness range is ${analysis.loudness_range.toFixed(2)} LU. The mix is too pinned before mastering.`);

    return {
      checkpoint_id: manifestHash.slice(0, 24),
      generated_at: new Date().toISOString(),
      approved_for_mastering: blockingReasons.length === 0,
      manifest_hash: manifestHash,
      requirements,
      blocking_reasons: blockingReasons,
      metrics: {
        integrated_lufs: analysis.integrated_loudness,
        true_peak_db: analysis.true_peak,
        sample_peak_db: samplePeakDb,
        loudness_range_lu: analysis.loudness_range,
        headroom_db: headroomDb,
      },
    };
  };

  const buildProcessingConfig = async (
    sourceBuffer: AudioBuffer,
    referenceBuffer?: AudioBuffer | null,
  ): Promise<ProcessingConfig> => {
    const genreMap: Record<MasteringParams['genre'], string> = {
      default: 'hip_hop',
      'hip-hop': 'hip_hop',
      pop: 'pop',
      indie: 'indie',
      rnb: 'rnb',
    };
    const analyzed = await audioEngine.analyzeVocalForConfig(genreMap[params.genre], sourceBuffer);
    let targetLoudness = params.targetLoudness;

    if (referenceBuffer) {
      const referenceMeasurement = await lufsMeteringService.measureLUFS(referenceBuffer);
      if (Number.isFinite(referenceMeasurement.integratedLUFS)) {
        targetLoudness = clamp(
          (targetLoudness + referenceMeasurement.integratedLUFS) / 2,
          -16,
          -10,
        );
      }
    }

    const styleConfig = buildStyleConfig(params.style, targetLoudness);
    const config = mergeConfigs(analyzed.config, styleConfig);

    if (changeRequest.trim()) {
      const lower = changeRequest.toLowerCase();
      if (lower.includes('warm')) {
        config.eq = [...(config.eq || []), { type: 'lowshelf', frequency: 220, gain: 0.8, q: 0.7 }];
      }
      if (lower.includes('bright') || lower.includes('air')) {
        config.eq = [...(config.eq || []), { type: 'highshelf', frequency: 9000, gain: 1.0, q: 0.7 }];
      }
      if (lower.includes('punch')) {
        config.transientShaper = { attack: 0.14, sustain: -0.04, mix: 0.72 };
      }
      if (lower.includes('subtle') || lower.includes('leave')) {
        config.outputTrimDb = Math.min(config.outputTrimDb || 0, 0.5);
      }
    }

    return config;
  };

  const normalizeMasterToTarget = async (buffer: AudioBuffer, targetLoudness: number): Promise<AudioBuffer> => {
    const working = cloneAudioBuffer(buffer);
    const initialMeasurement = await lufsMeteringService.measureLUFS(working);

    if (Number.isFinite(initialMeasurement.integratedLUFS)) {
      const gainDelta = clamp(targetLoudness - initialMeasurement.integratedLUFS, -6, 6);
      if (Math.abs(gainDelta) > 0.15) {
        applyGainInPlace(working, gainDelta);
      }
    }

    const peakMeasurement = await lufsMeteringService.measureLUFS(working);
    if (peakMeasurement.truePeak > -1.0) {
      applyGainInPlace(working, -1.0 - peakMeasurement.truePeak);
    }

    return working;
  };

  const handleMaster = async () => {
    if (!vocalFile) {
      alert('Please upload a vocal');
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const sourceBuffer = await decodeAudioFile(vocalFile);
      setProgress(18);

      if (!premasterCheckpoint) {
        const checkpoint = await buildPremasterCheckpoint(vocalFile, sourceBuffer);
        setPremasterCheckpoint(checkpoint);
        setProgress(100);
        if (!checkpoint.approved_for_mastering) {
          alert(`Premaster approval failed:\n${checkpoint.blocking_reasons.join('\n')}`);
        }
        return;
      }

      const approvalTimestamp = premasterApprovedAt || new Date().toISOString();
      if (!premasterApprovedAt) {
        setPremasterApprovedAt(approvalTimestamp);
      }

      const referenceBuffer = referenceFile ? await decodeAudioFile(referenceFile) : null;
      setProgress(32);

      const processingConfig = await buildProcessingConfig(sourceBuffer, referenceBuffer);
      setProgress(48);

      const rendered = await audioEngine.renderProcessedAudio(processingConfig, sourceBuffer);
      const masteredBuffer = await normalizeMasterToTarget(rendered, processingConfig.targetLufs || params.targetLoudness);
      setProgress(70);

      const [beforeAnalysis, afterAnalysis] = await Promise.all([
        analyzeBuffer(sourceBuffer),
        analyzeBuffer(masteredBuffer),
      ]);
      setProgress(82);

      const [beforeSpectrum, afterSpectrum, beforePreviewBlob, afterPreviewBlob] = await Promise.all([
        generateSpectrum(sourceBuffer, '#60a5fa'),
        generateSpectrum(masteredBuffer, '#f97316'),
        encoderService.exportAsWav(sourceBuffer),
        encoderService.exportAsWav(masteredBuffer),
      ]);

      if (renderArtifacts) {
        URL.revokeObjectURL(renderArtifacts.beforePreviewUrl);
        URL.revokeObjectURL(renderArtifacts.afterPreviewUrl);
      }

      const nextArtifacts: RenderArtifacts = {
        sourceBuffer,
        masteredBuffer,
        processingConfig,
        audioFileName: `${vocalFile.name.replace(/\.[^.]+$/, '')}-master.wav`,
        beforePreviewUrl: URL.createObjectURL(beforePreviewBlob),
        afterPreviewUrl: URL.createObjectURL(afterPreviewBlob),
      };

      setRenderArtifacts(nextArtifacts);
      setBeforeSpectrumUrl(beforeSpectrum);
      setAfterSpectrumUrl(afterSpectrum);
      setResult({
        metadata: {
          integrated_loudness: afterAnalysis.integrated_loudness,
          true_peak: afterAnalysis.true_peak,
          loudness_range: afterAnalysis.loudness_range,
          dynamic_range: afterAnalysis.dynamic_range,
          spectral_centroid: afterAnalysis.spectral_centroid,
          processing_chain_stages: countProcessingStages(processingConfig),
          quality_score: scoreMastering(processingConfig.targetLufs || params.targetLoudness, afterAnalysis, beforeAnalysis),
          genre: params.genre,
          style: params.style,
          reference_matched: Boolean(referenceBuffer),
        },
        beforeAnalysis,
        afterAnalysis,
      });
      onMasteringComplete?.(nextArtifacts.afterPreviewUrl);
      setProgress(100);
    } catch (error) {
      console.error('Mastering error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 300);
    }
  };

  const handleExport = async (format: 'wav' | 'mp3') => {
    if (!renderArtifacts) return;
    setIsExporting(true);
    try {
      await exportMasterWithManifest({
        processedBuffer: renderArtifacts.masteredBuffer,
        sourceBuffer: renderArtifacts.sourceBuffer,
        config: renderArtifacts.processingConfig,
        format,
        audioFileName: renderArtifacts.audioFileName.replace(/\.wav$/i, `.${format}`),
        creatorId: MASTER_EXPORT_CREATOR,
      });
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="pro-mastering-panel">
      <div className="studio-header">
        <h1>Echo Studio | Professional Mastering</h1>
        <p>Run a real premaster gate first, then print a controlled master from the browser-side DSP chain.</p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2">
            Change Brief
          </label>
          <textarea
            value={changeRequest}
            onChange={(e) => setChangeRequest(e.target.value)}
            placeholder="Example: pull the vocal down a touch, keep the beat punchy, warm the top end, and leave the dynamic EQ subtle."
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-orange-400/50"
          />
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            The brief now nudges the actual mastering config instead of sitting in a dead text field.
          </p>
        </div>
      </div>

      {!result ? (
        <div className="mastering-form">
          <div className="form-section reference-section">
            <h2>Reference Track (Optional)</h2>
            <p>Upload a mastered reference if you want the target loudness nudged toward its range.</p>
            <div className="file-upload">
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setReferenceFile(e.target.files?.[0] || null)}
                id="reference-upload"
              />
              <label htmlFor="reference-upload">
                {referenceFile ? referenceFile.name : 'Choose Reference'}
              </label>
            </div>
            {referenceFile && (
              <div className="file-info">
                <span>Reference loaded. Its measured loudness will influence the print target.</span>
              </div>
            )}
          </div>

          <div className="form-section vocal-section">
            <h2>Your Premaster</h2>
            <p>Upload the stereo premaster you actually want evaluated before mastering.</p>
            <div className="file-upload">
              <input
                type="file"
                accept="audio/wav,audio/mp3,audio/aac,audio/flac,audio/aiff"
                onChange={(e) => setVocalFile(e.target.files?.[0] || null)}
                id="vocal-upload"
                required
              />
              <label htmlFor="vocal-upload">
                {vocalFile ? vocalFile.name : 'Choose Premaster'}
              </label>
            </div>
            {!vocalFile && <p className="error">Premaster required</p>}
          </div>

          <div className="form-section params-section">
            <h2>Processing Settings</h2>

            <div className="param-group">
              <label>Genre</label>
              <select
                value={params.genre}
                onChange={(e) => setParams({ ...params, genre: e.target.value as MasteringParams['genre'] })}
              >
                <option value="default">Auto-Detect</option>
                <option value="hip-hop">Hip-Hop</option>
                <option value="pop">Pop</option>
                <option value="indie">Indie</option>
                <option value="rnb">R&B</option>
              </select>
            </div>

            <div className="param-group">
              <label>Style</label>
              <select
                value={params.style}
                onChange={(e) => setParams({ ...params, style: e.target.value as MasteringParams['style'] })}
              >
                <option value="conservative">Conservative (subtle)</option>
                <option value="balanced">Balanced (recommended)</option>
                <option value="bright">Bright (radio-ready)</option>
                <option value="warm">Warm (analog feel)</option>
                <option value="punchy">Punchy (aggressive)</option>
              </select>
            </div>

            <div className="param-group">
              <label>Target Loudness (LUFS)</label>
              <input
                type="range"
                min="-18"
                max="-10"
                step="0.5"
                value={params.targetLoudness}
                onChange={(e) => setParams({ ...params, targetLoudness: parseFloat(e.target.value) })}
              />
              <span className="loudness-display">{params.targetLoudness} LUFS</span>
              <p className="help-text">
                {params.targetLoudness === -14 && 'Standard streaming delivery target'}
                {params.targetLoudness < -14 && 'Quieter print with more preserved headroom'}
                {params.targetLoudness > -14 && 'Hotter print with less margin'}
              </p>
            </div>
          </div>

          {premasterCheckpoint && (
            <div className="form-section">
              <h2>Premaster Approval Gate</h2>
              <p>
                Checkpoint {premasterCheckpoint.checkpoint_id.slice(0, 12)} · True Peak {premasterCheckpoint.metrics.true_peak_db.toFixed(2)} dBTP ·
                LRA {premasterCheckpoint.metrics.loudness_range_lu.toFixed(2)} LU · Headroom {premasterCheckpoint.metrics.headroom_db.toFixed(2)} dB
              </p>
              {!premasterCheckpoint.approved_for_mastering && premasterCheckpoint.blocking_reasons.length > 0 && (
                <ul className="error">
                  {premasterCheckpoint.blocking_reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              {premasterCheckpoint.approved_for_mastering && (
                <p className="help-text">
                  Premaster passed. The second click approves this checkpoint and prints the master from the browser DSP path.
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleMaster}
            disabled={!vocalFile || isProcessing}
            className="master-button"
          >
            {isProcessing ? (
              <>
                <span className="spinner"></span>
                PROCESSING ({Math.round(progress)}%)
              </>
            ) : (
              premasterCheckpoint?.approved_for_mastering && premasterApprovedAt
                ? 'RENDER MASTER'
                : premasterCheckpoint?.approved_for_mastering
                  ? 'APPROVE PREMASTER + MASTER'
                  : 'RUN PREMASTER GATE'
            )}
          </button>

          {isProcessing && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          )}
        </div>
      ) : (
        <div className="mastering-results">
          <h2>Mastering Complete</h2>

          <div className="quality-score">
            <div className="score-number">{result.metadata.quality_score.toFixed(1)}/100</div>
            <div className="score-label">Quality Score</div>
            <div className="score-grade">
              {result.metadata.quality_score >= 90 ? 'Validated Premium' : 'Controlled Print'}
            </div>
          </div>

          <div className="comparison">
            <div className="before-section">
              <h3>Before Mastering</h3>
              {beforeSpectrumUrl && <img src={beforeSpectrumUrl} alt="Before spectrum" />}
              <table className="metrics-table">
                <tbody>
                  <tr>
                    <td>Loudness</td>
                    <td>{result.beforeAnalysis.integrated_loudness.toFixed(1)} LUFS</td>
                  </tr>
                  <tr>
                    <td>True Peak</td>
                    <td>{result.beforeAnalysis.true_peak.toFixed(2)} dBTP</td>
                  </tr>
                  <tr>
                    <td>Dynamic Range</td>
                    <td>{result.beforeAnalysis.dynamic_range.toFixed(1)} dB</td>
                  </tr>
                  <tr>
                    <td>Noise Floor</td>
                    <td>{result.beforeAnalysis.artifacts.noise_floor_db.toFixed(1)} dB</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="arrow">-&gt;</div>

            <div className="after-section">
              <h3>After Mastering</h3>
              {afterSpectrumUrl && <img src={afterSpectrumUrl} alt="After spectrum" />}
              <table className="metrics-table">
                <tbody>
                  <tr>
                    <td>Loudness</td>
                    <td className="highlight">{result.metadata.integrated_loudness.toFixed(1)} LUFS</td>
                  </tr>
                  <tr>
                    <td>True Peak</td>
                    <td className="highlight">{result.metadata.true_peak.toFixed(2)} dBTP</td>
                  </tr>
                  <tr>
                    <td>Loudness Range</td>
                    <td className="highlight">{result.metadata.loudness_range.toFixed(1)} LU</td>
                  </tr>
                  <tr>
                    <td>Processing Stages</td>
                    <td>{result.metadata.processing_chain_stages}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="download-section">
            {renderArtifacts && (
              <ProofPlayer
                beforeSrc={renderArtifacts.beforePreviewUrl}
                afterSrc={renderArtifacts.afterPreviewUrl}
                beforeLabel="Premaster"
                afterLabel="Rendered master"
                title="A/B proof player"
                subtitle="Compare the premaster against the printed master with the actual audio from this run."
              />
            )}

            <div className="payment-gate">
              <button
                className="download-button primary"
                onClick={() => handleExport('wav')}
                disabled={!renderArtifacts || isExporting}
              >
                {isExporting ? 'Exporting…' : 'Download WAV + Manifest'}
              </button>
              <button
                className="download-button secondary"
                onClick={() => handleExport('mp3')}
                disabled={!renderArtifacts || isExporting}
              >
                Download MP3 + Manifest
              </button>
              <button className="download-button secondary" onClick={() => setResult(null)}>
                Master Another Vocal
              </button>
            </div>
          </div>

          <details className="detailed-report">
            <summary>Detailed Processing Report</summary>
            <div className="report-content">
              <p>
                <strong>Genre:</strong> {result.metadata.genre}
              </p>
              <p>
                <strong>Style:</strong> {result.metadata.style}
              </p>
              <p>
                <strong>Processing Stages:</strong> {result.metadata.processing_chain_stages}
              </p>
              <p>
                <strong>Reference Influence:</strong> {result.metadata.reference_matched ? 'Applied to loudness target' : 'None'}
              </p>
              <h4>Professional Standards Met</h4>
              <ul>
                <li>
                  Integrated Loudness: {result.metadata.integrated_loudness.toFixed(2)} LUFS
                </li>
                <li>
                  True Peak: {result.metadata.true_peak.toFixed(2)} dBTP
                </li>
                <li>
                  Loudness Range: {result.metadata.loudness_range.toFixed(2)} LU
                </li>
                <li>
                  Spectral Centroid: {result.metadata.spectral_centroid.toFixed(0)} Hz
                </li>
              </ul>
              <p className="standards-note">
                Measured locally with the browser DSP stack and LUFS metering service. No remote mastering placeholder was used in this path.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};
