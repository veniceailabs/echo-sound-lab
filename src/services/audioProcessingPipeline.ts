/**
 * CLEAN AUDIO PROCESSING PIPELINE
 *
 * Unified interface abstracting the audio engine complexity.
 * Single responsibility: Take audio + actions → produce processed audio + metrics
 *
 * Replaces the confusing array of audioEngine methods:
 * - renderProcessedAudio() / renderWithWebAudio() / renderWithCustomDSP()
 * - applyProcessingConfig() / enableProcessedSignal() / disableProcessedSignal()
 * - switchToOriginal() / getOriginalBuffer() / etc.
 */

import { ProcessingAction, ProcessingConfig, AudioMetrics, PreservationMode } from '../types';
import { actionsToConfig } from './processingActionUtils';
import { audioEngine } from './audioEngine';
import { mixAnalysisService } from './mixAnalysis';
import { calculateLoudnessRange } from './dsp/analysisUtils';
import { lufsMeteringService } from './lufsMetering';
import type { APLPerceptualField } from './aplPerceptualField';
import type { ReferenceDeltaAnalysis } from './finishing/referenceDeltaEngine';
import type { ReferenceWorldAnalysis } from './finishing/referenceWorldEngine';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t, 0, 1);

export interface ProcessingResult {
  processedBuffer: AudioBuffer;
  metrics: AudioMetrics;
  appliedActions: ProcessingAction[];
  qualityLoop?: {
    enabled: boolean;
    attempts: QualityLoopAttempt[];
    selectedAttempt: number;
    targetLufs: number;
    targetDynamicRange: number;
    targetPeakDb: number;
    blocked: boolean;
    reason?: string;
  };
  preservation: {
    mode: PreservationMode;
    originalDynamicRange: number;
    processedDynamicRange: number;
    minAllowedDynamicRange: number;
    hardCapDb: number;
    wasAdjusted: boolean;
    blocked: boolean;
    reason?: string;
  };
}

export interface ProcessingPipelineOptions {
  preservationMode?: PreservationMode;
  perceptualField?: APLPerceptualField | null;
  referenceDeltaAnalysis?: ReferenceDeltaAnalysis | null;
  referenceWorldAnalysis?: ReferenceWorldAnalysis | null;
}

interface QualityLoopAttempt {
  attempt: number;
  candidate: string;
  integratedLUFS: number;
  dynamicRange: number;
  peakDb: number;
  score: number;
  accepted: boolean;
  adjustments: string[];
}

interface QualityLoopCandidate {
  label: string;
  config: ProcessingConfig;
}

export class AudioProcessingPipeline {
  private originalBuffer: AudioBuffer | null = null;
  private processedBuffer: AudioBuffer | null = null;
  private isPlayingProcessed: boolean = false;
  private readonly safetyPeakTargetDb = -1.0;
  private readonly safetyPeakThresholdDb = -0.3;
  private readonly makeupPeakTargetDb = -0.65;
  private readonly globalHardCapDb = 2.0;
  private readonly preservationBudgets: Record<PreservationMode, number> = {
    preserve: 1.2,
    balanced: 1.6,
    competitive: 2.0,
  };
  private originalMetrics: AudioMetrics | null = null;
  private cachedOriginalIntegratedLUFS: number | null = null;

  private sliceForLufs(buffer: AudioBuffer, maxSeconds: number): AudioBuffer {
    const maxLen = Math.max(1, Math.min(buffer.length, Math.floor(buffer.sampleRate * maxSeconds)));
    if (maxLen === buffer.length) return buffer;
    const excerpt = new AudioBuffer({
      length: maxLen,
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
    });
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = excerpt.getChannelData(ch);
      dst.set(src.subarray(0, maxLen));
    }
    return excerpt;
  }

  private async estimateIntegratedLUFSFast(buffer: AudioBuffer): Promise<number> {
    // Keep this bounded for UX: integrated LUFS is expensive if we run full-track + true-peak.
    // 30s is enough to kill “quiet-only” perception without turning this into a loudness chase.
    const excerpt = this.sliceForLufs(buffer, 30);
    try {
      const lufs = await lufsMeteringService.calculateIntegratedLUFS(excerpt);
      if (Number.isFinite(lufs)) return lufs;
    } catch (e) {
      // ignore and fall back
    }

    // Fallback: RMS-based estimate. Consistent with existing codepaths.
    const metrics = mixAnalysisService.analyzeStaticMetrics(excerpt);
    return metrics.rms + 3;
  }

  private applyGainToBuffer(buffer: AudioBuffer, gainLinear: number) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channel = buffer.getChannelData(ch);
      for (let i = 0; i < channel.length; i++) {
        channel[i] *= gainLinear;
      }
    }
  }

  private getTargetLufs(mode: PreservationMode): number {
    return mode === 'preserve' ? -14.5 : mode === 'balanced' ? -13.8 : -13.2;
  }

  private getLufsTolerance(mode: PreservationMode): number {
    return mode === 'preserve' ? 0.8 : mode === 'balanced' ? 1.1 : 1.5;
  }

  private cloneConfig(config: ProcessingConfig): ProcessingConfig {
    if (typeof structuredClone === 'function') {
      return structuredClone(config);
    }
    return JSON.parse(JSON.stringify(config)) as ProcessingConfig;
  }

  private distributeAttempts(total: number, buckets: number): number[] {
    const safeBuckets = Math.max(1, buckets);
    const base = Math.floor(total / safeBuckets);
    const remainder = total % safeBuckets;
    return Array.from({ length: safeBuckets }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  private shapeConfigForPerceptualField(
    config: ProcessingConfig,
    perceptualField: APLPerceptualField,
  ): ProcessingConfig {
    const shaped = this.cloneConfig(config);
    const clarity = clamp(perceptualField.clarity, 0, 1);
    const density = clamp(perceptualField.density, 0, 1);
    const motion = clamp(perceptualField.motion, 0, 1);
    const width = clamp(perceptualField.width, 0, 1);
    const depth = clamp(perceptualField.depth, 0, 1);
    const punch = clamp(perceptualField.punch, 0, 1);
    const restraint = clamp(perceptualField.restraint, 0, 1);
    const lift = clamp(perceptualField.lift, 0, 1);
    const risk = clamp(perceptualField.risk, 0, 1);

    if (shaped.compression) {
      const intensity = clamp(punch * 0.5 + density * 0.25 + risk * 0.12 - clarity * 0.08, 0, 1);
      shaped.compression = {
        ...shaped.compression,
        ratio: clamp(lerp(shaped.compression.ratio ?? 2.0, 2.8, intensity), 1.08, 4.5),
        threshold: clamp(lerp(shaped.compression.threshold ?? -18, -22.5, intensity), -32, -4),
        attack: clamp(lerp(shaped.compression.attack ?? 0.012, 0.02, punch * 0.6), 0.002, 0.08),
        release: clamp(lerp(shaped.compression.release ?? 0.14, 0.24, motion * 0.55 + lift * 0.2), 0.03, 0.6),
      };
    }

    if (shaped.limiter) {
      const ceiling = Math.min(shaped.limiter.threshold ?? this.safetyPeakTargetDb, perceptualField.peakCeilingDb);
      shaped.limiter = {
        ...shaped.limiter,
        threshold: clamp(ceiling, -3, -0.15),
        release: clamp(lerp(shaped.limiter.release ?? 0.12, 0.18, restraint * 0.5 + risk * 0.2), 0.02, 0.6),
      };
    }

    if (shaped.saturation) {
      const saturationPush = clamp(punch * 0.42 + density * 0.16 + lift * 0.12 - risk * 0.18, 0, 1);
      shaped.saturation = {
        ...shaped.saturation,
        amount: clamp(lerp(shaped.saturation.amount, 0.48, saturationPush), 0, 0.7),
        mix: clamp(lerp(shaped.saturation.mix ?? 1, 0.82, saturationPush * 0.9), 0.05, 1),
      };
    }

    if (shaped.motionReverb) {
      const motionPush = clamp(motion * 0.42 + depth * 0.2 + lift * 0.18 - risk * 0.12, 0, 1);
      shaped.motionReverb = {
        ...shaped.motionReverb,
        mix: clamp(lerp(shaped.motionReverb.mix, 0.18, motionPush), 0, 0.4),
        decay: clamp(lerp(shaped.motionReverb.decay, 1.9, depth * 0.42 + lift * 0.18), 0.4, 5),
        preDelay: clamp(lerp(shaped.motionReverb.preDelay, 0.028, clarity * 0.28), 0.005, 0.08),
        motion: shaped.motionReverb.motion
          ? {
              bpm: shaped.motionReverb.motion.bpm,
              depth: clamp(lerp(shaped.motionReverb.motion.depth, motionPush, 0.5), 0, 1),
            }
          : {
              bpm: 120,
              depth: motionPush,
            },
      };
    }

    if (shaped.delay) {
      const delayPush = clamp(motion * 0.38 + lift * 0.28 + width * 0.14 - risk * 0.2, 0, 1);
      shaped.delay = {
        ...shaped.delay,
        mix: clamp(lerp(shaped.delay.mix, 0.16, delayPush), 0, 0.35),
        feedback: clamp(lerp(shaped.delay.feedback, 0.28, motion * 0.34 + lift * 0.2), 0, 0.65),
        time: clamp(lerp(shaped.delay.time, 0.24, motion * 0.24 + lift * 0.08), 0.03, 1.2),
      };
    }

    if (shaped.stereoImager) {
      const widthPush = clamp(width * 0.5 + lift * 0.16 - risk * 0.2, 0, 1);
      shaped.stereoImager = {
        ...shaped.stereoImager,
        lowWidth: clamp(lerp(shaped.stereoImager.lowWidth, 0.96, density * 0.25 + risk * 0.24), 0.5, 1.15),
        midWidth: clamp(lerp(shaped.stereoImager.midWidth, 1.05, widthPush), 0.6, 1.35),
        highWidth: clamp(lerp(shaped.stereoImager.highWidth, 1.12, widthPush + clarity * 0.12), 0.7, 1.5),
      };
    }

    if (shaped.transientShaper) {
      const transientPush = clamp(punch * 0.5 + clarity * 0.18 + restraint * 0.1 - risk * 0.12, 0, 1);
      shaped.transientShaper = {
        ...shaped.transientShaper,
        attack: clamp(lerp(shaped.transientShaper.attack, 0.22, transientPush), 0, 1),
        sustain: clamp(lerp(shaped.transientShaper.sustain, 0.12, 1 - transientPush * 0.55), 0, 1),
        mix: clamp(lerp(shaped.transientShaper.mix, 0.72, transientPush), 0, 1),
      };
    }

    if (shaped.deEsser) {
      const deEssPush = clamp(clarity * 0.42 + punch * 0.12 + risk * 0.16, 0, 1);
      shaped.deEsser = {
        ...shaped.deEsser,
        amount: clamp(lerp(shaped.deEsser.amount, 0.42, deEssPush), 0, 1),
      };
    }

    if (shaped.outputTrimDb !== undefined) {
      shaped.outputTrimDb = clamp(lerp(shaped.outputTrimDb, -0.4, restraint * 0.42 + risk * 0.18), -6, 1);
    }

    return shaped;
  }

  private shapeConfigForReferenceWorld(
    config: ProcessingConfig,
    perceptualField: APLPerceptualField,
    referenceWorldAnalysis: ReferenceWorldAnalysis,
  ): ProcessingConfig {
    const shaped = this.shapeConfigForPerceptualField(config, perceptualField);
    const profile = referenceWorldAnalysis.bestProfile;
    const vocalForwardness = profile.vocalForwardnessTarget;
    const widthTarget = (profile.widthTarget[0] + profile.widthTarget[1]) / 2;
    const aggressionTarget = (profile.finishAggression[0] + profile.finishAggression[1]) / 2;
    const hookTarget = (profile.hookLiftTarget[0] + profile.hookLiftTarget[1]) / 2;
    const lowEndWeight = (profile.lowEndWeight[0] + profile.lowEndWeight[1]) / 2;

    if (shaped.compression) {
      const profileDrive = clamp(vocalForwardness * 0.38 + aggressionTarget * 0.26 + hookTarget * 0.12, 0, 1);
      shaped.compression = {
        ...shaped.compression,
        ratio: clamp(lerp(shaped.compression.ratio ?? 2.0, 3.1, profileDrive), 1.08, 4.8),
        threshold: clamp(lerp(shaped.compression.threshold ?? -18, -24, profileDrive), -34, -4),
      };
    }

    if (shaped.stereoImager) {
      const widthPush = clamp(widthTarget * 0.72 + hookTarget * 0.12 - lowEndWeight * 0.08, 0, 1);
      shaped.stereoImager = {
        ...shaped.stereoImager,
        lowWidth: clamp(lerp(shaped.stereoImager.lowWidth, profile.adlibDepthStyle === 'tight' ? 0.88 : 0.94, lowEndWeight * 0.26), 0.5, 1.1),
        midWidth: clamp(lerp(shaped.stereoImager.midWidth, 1.0 + widthPush * 0.08, widthPush), 0.6, 1.28),
        highWidth: clamp(lerp(shaped.stereoImager.highWidth, 1.1 + widthPush * 0.16, widthPush), 0.7, 1.45),
      };
    }

    if (shaped.motionReverb) {
      const profileDepth = profile.adlibDepthStyle === 'wide' ? 0.58 : profile.adlibDepthStyle === 'supportive' ? 0.42 : 0.3;
      shaped.motionReverb = {
        ...shaped.motionReverb,
        mix: clamp(Math.min(shaped.motionReverb.mix, profile.adlibDepthStyle === 'tight' ? 0.12 : 0.18), 0, 0.35),
        decay: clamp(lerp(shaped.motionReverb.decay, profile.adlibDepthStyle === 'wide' ? 2.1 : 1.5, profileDepth), 0.4, 5),
        preDelay: clamp(lerp(shaped.motionReverb.preDelay, profile.adlibDepthStyle === 'tight' ? 0.018 : 0.028, 0.5), 0.005, 0.08),
      };
    }

    if (shaped.delay) {
      const delayPush = clamp(profile.finishAggression[0] * 0.28 + hookTarget * 0.28 + perceptualField.motion * 0.18, 0, 1);
      shaped.delay = {
        ...shaped.delay,
        mix: clamp(lerp(shaped.delay.mix, profile.translationPriority === 'maximum' ? 0.1 : 0.14, delayPush), 0, 0.32),
        feedback: clamp(lerp(shaped.delay.feedback, profile.adlibDepthStyle === 'wide' ? 0.34 : 0.24, delayPush), 0, 0.55),
      };
    }

    return shaped;
  }

  private shapeConfigForReferenceDelta(
    config: ProcessingConfig,
    perceptualField: APLPerceptualField,
    referenceDeltaAnalysis: ReferenceDeltaAnalysis,
  ): ProcessingConfig {
    const shaped = this.shapeConfigForPerceptualField(config, perceptualField);
    const tonal = referenceDeltaAnalysis.tonal;
    const stereo = referenceDeltaAnalysis.stereo;
    const loudness = referenceDeltaAnalysis.loudness.delta;
    const dynamics = referenceDeltaAnalysis.dynamics.delta;
    const matchScore = clamp(referenceDeltaAnalysis.matchScore / 100, 0, 1);

    if (shaped.compression) {
      const dynamicsBias = clamp(Math.abs(dynamics) / 4, 0, 1);
      shaped.compression = {
        ...shaped.compression,
        ratio: clamp(lerp(shaped.compression.ratio ?? 2.0, dynamics > 0 ? 2.45 : 2.05, dynamicsBias), 1.08, 4.2),
        threshold: clamp(lerp(shaped.compression.threshold ?? -18, loudness > 0 ? -21.5 : -18.5, clamp(Math.abs(loudness) / 4, 0, 1)), -34, -4),
        attack: clamp(lerp(shaped.compression.attack ?? 0.01, 0.016, clamp(1 - matchScore, 0, 1)), 0.002, 0.08),
      };
    }

    if (shaped.stereoImager) {
      const stereoPush = clamp(0.5 + stereo.high * 0.6 + stereo.mid * 0.3, 0, 1);
      shaped.stereoImager = {
        ...shaped.stereoImager,
        lowWidth: clamp(lerp(shaped.stereoImager.lowWidth, 0.92, clamp(Math.abs(stereo.low) / 0.18, 0, 1)), 0.5, 1.12),
        midWidth: clamp(lerp(shaped.stereoImager.midWidth, 1 + stereoPush * 0.08, clamp(Math.abs(stereo.mid) / 0.18, 0, 1)), 0.6, 1.32),
        highWidth: clamp(lerp(shaped.stereoImager.highWidth, 1.06 + stereoPush * 0.16, clamp(Math.abs(stereo.high) / 0.2, 0, 1)), 0.7, 1.48),
      };
    }

    if (shaped.eq && shaped.eq.length > 0) {
      const lowTarget = clamp(tonal.low * 2.1, -2.5, 2.5);
      const lowMidTarget = clamp(tonal.lowMid * 1.8, -2.2, 2.2);
      const midTarget = clamp(tonal.mid * 1.4, -1.8, 1.8);
      const highMidTarget = clamp(tonal.highMid * 2.0, -2.2, 2.2);
      const highTarget = clamp(tonal.high * 2.4, -2.8, 2.8);

      shaped.eq = shaped.eq.map((band) => {
        if (band.frequency <= 120) {
          return { ...band, gain: clamp((band.gain ?? 0) + lowTarget * 0.7, -6, 6) };
        }
        if (band.frequency <= 320) {
          return { ...band, gain: clamp((band.gain ?? 0) + lowMidTarget * 0.8, -6, 6) };
        }
        if (band.frequency <= 2400) {
          return { ...band, gain: clamp((band.gain ?? 0) + midTarget * 0.7, -5, 5) };
        }
        if (band.frequency <= 5200) {
          return { ...band, gain: clamp((band.gain ?? 0) + highMidTarget * 0.8, -6, 6) };
        }
        return { ...band, gain: clamp((band.gain ?? 0) + highTarget * 0.75, -6, 6) };
      });
    }

    if (shaped.outputTrimDb !== undefined) {
      shaped.outputTrimDb = clamp(shaped.outputTrimDb + clamp(-loudness * 0.28, -0.8, 0.8), -6, 1);
    }

    return shaped;
  }

  private buildQualityCandidates(
    initialConfig: ProcessingConfig,
    perceptualField?: APLPerceptualField | null,
    referenceDeltaAnalysis?: ReferenceDeltaAnalysis | null,
    referenceWorldAnalysis?: ReferenceWorldAnalysis | null,
  ): QualityLoopCandidate[] {
    const candidates: QualityLoopCandidate[] = [
      {
        label: 'bounded baseline',
        config: this.cloneConfig(initialConfig),
      },
    ];

    if (perceptualField) {
      candidates.push({
        label: 'perceptual target',
        config: this.shapeConfigForPerceptualField(initialConfig, perceptualField),
      });
    }

    if (perceptualField && referenceDeltaAnalysis) {
      candidates.push({
        label: 'reference delta correction',
        config: this.shapeConfigForReferenceDelta(initialConfig, perceptualField, referenceDeltaAnalysis),
      });
    }

    if (perceptualField && referenceWorldAnalysis) {
      candidates.push({
        label: `${referenceWorldAnalysis.bestProfile.label} lane`,
        config: this.shapeConfigForReferenceWorld(initialConfig, perceptualField, referenceWorldAnalysis),
      });
    }

    candidates.push({
      label: 'relaxed safety',
      config: this.relaxProcessingPressure(initialConfig, 1),
    });

    return candidates;
  }

  private scoreQualityAttempt(
    originalLufs: number,
    targetLufs: number,
    currentLufs: number,
    originalDynamicRange: number,
    currentDynamicRange: number,
    peakDb: number,
    minAllowedDynamicRange: number,
    perceptualField?: APLPerceptualField | null,
    referenceDeltaAnalysis?: ReferenceDeltaAnalysis | null,
    referenceWorldAnalysis?: ReferenceWorldAnalysis | null,
  ): number {
    const lufsPenalty = Math.abs(currentLufs - targetLufs) * 1.5;
    const drPenalty = Math.max(0, minAllowedDynamicRange - currentDynamicRange) * 4;
    const peakPenalty = Math.max(0, peakDb - this.safetyPeakThresholdDb) * 6;
    const quietPenalty = Math.max(0, originalLufs - currentLufs - 1.0) * 1.2;
    const overCompressionPenalty = Math.max(0, originalDynamicRange - currentDynamicRange - this.globalHardCapDb) * 5;
    const perceptualReward = perceptualField
      ? Math.max(0, ((perceptualField.clarity + perceptualField.punch + perceptualField.stabilityScore) / 3) - 0.5) * 0.6
      : 0;
    const referenceDeltaReward = referenceDeltaAnalysis
      ? Math.max(0, referenceDeltaAnalysis.matchScore / 100 - 0.5) * 0.45
        + Math.max(0, 0.12 - Math.abs(referenceDeltaAnalysis.tonal.highMid)) * 1.4
        + Math.max(0, 0.12 - Math.abs(referenceDeltaAnalysis.stereo.mid)) * 0.9
      : 0;
    const referenceReward = referenceWorldAnalysis?.bestProfile
      ? Math.max(0, referenceWorldAnalysis.bestProfile.finishAggression[1] - 0.5) * 0.15
      : 0;
    return lufsPenalty + drPenalty + peakPenalty + quietPenalty + overCompressionPenalty - perceptualReward - referenceDeltaReward - referenceReward;
  }

  private relaxProcessingPressure(config: ProcessingConfig, level: number): ProcessingConfig {
    const softened: ProcessingConfig = { ...config };
    const compressionRatioCap = Math.max(1.08, 2.4 - level * 0.32);
    const limiterThresholdFloor = -0.9 + level * 0.18;
    const saturationMixCeiling = Math.max(0.12, 0.55 - level * 0.1);
    const reverbMixCeiling = Math.max(0.06, 0.22 - level * 0.03);

    if (softened.compression) {
      softened.compression = {
        ...softened.compression,
        ratio: Math.min(softened.compression.ratio ?? compressionRatioCap, compressionRatioCap),
        threshold: Math.max(softened.compression.threshold ?? -12, -8 + level),
      };
    }

    if (softened.limiter) {
      softened.limiter = {
        ...softened.limiter,
        threshold: Math.max(softened.limiter.threshold ?? -1.0, limiterThresholdFloor),
      };
    }

    if (softened.saturation) {
      softened.saturation = {
        ...softened.saturation,
        amount: Math.min(softened.saturation.amount, saturationMixCeiling),
        mix: Math.min(softened.saturation.mix ?? 1, 0.8),
      };
    }

    if (softened.motionReverb) {
      softened.motionReverb = {
        ...softened.motionReverb,
        mix: Math.min(softened.motionReverb.mix, reverbMixCeiling),
      };
    }

    if (softened.delay) {
      softened.delay = {
        ...softened.delay,
        mix: Math.min(softened.delay.mix, Math.max(0.05, 0.18 - level * 0.02)),
        feedback: Math.min(softened.delay.feedback, 0.28),
      };
    }

    if (softened.stereoImager) {
      softened.stereoImager = {
        ...softened.stereoImager,
        lowWidth: Math.min(softened.stereoImager.lowWidth, 1),
        midWidth: Math.min(softened.stereoImager.midWidth, 1),
        highWidth: Math.min(softened.stereoImager.highWidth, 1.1),
      };
    }

    return softened;
  }

  /**
   * Load original audio file
   */
  async loadAudio(buffer: AudioBuffer): Promise<void> {
    this.originalBuffer = buffer;
    this.processedBuffer = null;
    this.isPlayingProcessed = false;
    this.originalMetrics = mixAnalysisService.analyzeStaticMetrics(buffer);
    this.cachedOriginalIntegratedLUFS = null;
    audioEngine.setBuffer(buffer);
    audioEngine.setProcessedBuffer(null);
  }

  /**
   * Process audio with selected actions
   * Returns new audio buffer + updated metrics
   */
  async processAudio(
    selectedActions: ProcessingAction[],
    options: ProcessingPipelineOptions = {}
  ): Promise<ProcessingResult> {
    if (!this.originalBuffer) throw new Error('No audio loaded');
    const preservationMode = options.preservationMode ?? 'balanced';
    const originalMetrics = this.originalMetrics || mixAnalysisService.analyzeStaticMetrics(this.originalBuffer);
    const originalDynamicRange = calculateLoudnessRange(this.originalBuffer);
    const allowedReductionDb = Math.min(this.preservationBudgets[preservationMode], this.globalHardCapDb);
    const fieldTargetDynamicRange = options.perceptualField?.targetDynamicRange;
    const minAllowedDynamicRange = Math.max(
      originalDynamicRange - allowedReductionDb,
      fieldTargetDynamicRange ?? Number.NEGATIVE_INFINITY
    );
    const originalLufs = await this.estimateIntegratedLUFSFast(this.originalBuffer);
    const targetLufs = options.perceptualField?.targetLufs ?? this.getTargetLufs(preservationMode);
    const lufsTolerance = options.perceptualField
      ? clamp(1.2 - options.perceptualField.stabilityScore * 0.45, 0.55, 1.2)
      : this.getLufsTolerance(preservationMode);
    const attemptBudget = clamp(
      Math.round(4 + (options.perceptualField?.stabilityScore ?? 0.5) * 1.5 - (options.perceptualField?.risk ?? 0.5) * 1.5),
      3,
      6
    );

    // Convert ProcessingAction[] to ProcessingConfig
    const config = actionsToConfig(selectedActions);
    const boundedConfig = this.applyPreservationBounds(config, originalDynamicRange, preservationMode);

    // Render, measure, compare, relax, and commit only if the attempt is safe.
    const enforcement = await this.renderWithQualityLoop(
      this.originalBuffer,
      boundedConfig,
      originalLufs,
      targetLufs,
      lufsTolerance,
      originalDynamicRange,
      minAllowedDynamicRange,
      attemptBudget,
      options.perceptualField ?? null,
      options.referenceDeltaAnalysis ?? null,
      options.referenceWorldAnalysis ?? null
    );
    const processedBuffer = enforcement.buffer;

    // Analyze new metrics
    let metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
    const preTrimMetrics = metrics;

    // Safety trim to prevent unintended clipping from recommendations
    if (metrics.peak > this.safetyPeakThresholdDb) {
      const trimDb = this.safetyPeakTargetDb - metrics.peak;
      const linearGain = Math.pow(10, trimDb / 20);
      this.applyGainToBuffer(processedBuffer, linearGain);
      metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);

      // Soft-knee recovery: restore part of perceived loudness when trim was aggressive.
      const rmsDropDb = preTrimMetrics.rms - metrics.rms;
      const availableHeadroomDb = this.makeupPeakTargetDb - metrics.peak;
      if (rmsDropDb > 0.4 && availableHeadroomDb > 0.05) {
        const makeupDb = Math.min(
          rmsDropDb * 0.5,
          availableHeadroomDb * 0.85,
          0.5
        );
        if (makeupDb > 0.05) {
          this.applyGainToBuffer(processedBuffer, Math.pow(10, makeupDb / 20));
          metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
        }
      }
    }

    // Loudness Match (perception guard): avoid “it just got quieter”.
    // We only ever push UP (bounded), and only within headroom, so we don't trigger clipping.
    // This is not a streaming loudness target; it's an A/B fairness step for users.
    try {
      if (this.originalBuffer && processedBuffer !== this.originalBuffer) {
        if (this.cachedOriginalIntegratedLUFS === null) {
          this.cachedOriginalIntegratedLUFS = originalLufs;
        }
        const originalLUFS = this.cachedOriginalIntegratedLUFS;
        const processedLUFS = await this.estimateIntegratedLUFSFast(processedBuffer);

        // If processed is meaningfully quieter, recover toward original (+0.3 LU) but stay bounded.
        const targetLUFS = originalLUFS + 0.3;
        const neededDb = targetLUFS - processedLUFS;
        if (neededDb > 0.35) {
          // Stay under the safety threshold, leaving a small margin for analyzer error.
          const availableHeadroomDb = (this.safetyPeakThresholdDb - 0.05) - metrics.peak;
          const applyDb = Math.min(neededDb, Math.max(0, availableHeadroomDb * 0.9), 1.0);
          if (applyDb > 0.05) {
            this.applyGainToBuffer(processedBuffer, Math.pow(10, applyDb / 20));
            // Update metrics without re-running LUFS (gain in dB translates directly).
            metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
            metrics.lufs = {
              integrated: processedLUFS + applyDb,
              shortTerm: processedLUFS + applyDb,
              momentary: processedLUFS + applyDb,
              loudnessRange: metrics.crestFactor,
              truePeak: metrics.peak,
            };
          }
        }
      }
    } catch (e) {
      // Loudness match is a perception guard; if it fails, never block processing.
      console.warn('[audioProcessingPipeline] Loudness match skipped due to error', e);
    }

    // If loudness match already populated LUFS (more accurate), preserve it.
    metrics.lufs = metrics.lufs ?? {
      integrated: metrics.rms + 3,
      shortTerm: metrics.rms + 3,
      momentary: metrics.rms + 3,
      loudnessRange: metrics.crestFactor,
      truePeak: metrics.peak,
    };

    const processedDynamicRange = calculateLoudnessRange(processedBuffer);
    const violatesHardCeiling = processedDynamicRange < minAllowedDynamicRange || enforcement.hadViolation;
    if (violatesHardCeiling && this.originalBuffer) {
      // Non-bypassable hard ceiling: reject processing if DR floor is breached.
      this.processedBuffer = this.originalBuffer;
      audioEngine.setProcessedBuffer(this.originalBuffer);
      const fallbackMetrics = {
        ...originalMetrics,
        lufs: originalMetrics.lufs || {
          integrated: originalMetrics.rms + 3,
          shortTerm: originalMetrics.rms + 3,
          momentary: originalMetrics.rms + 3,
          loudnessRange: originalMetrics.crestFactor,
          truePeak: originalMetrics.peak,
        },
      };
      return {
        processedBuffer: this.originalBuffer,
        metrics: fallbackMetrics,
        appliedActions: selectedActions,
        preservation: {
          mode: preservationMode,
          originalDynamicRange,
          processedDynamicRange,
          minAllowedDynamicRange,
          hardCapDb: this.globalHardCapDb,
          wasAdjusted: boundedConfig !== config,
          blocked: true,
          reason: enforcement.hadViolation
            ? `Dynamic range floor breached after final render (${processedDynamicRange.toFixed(2)}dB < ${minAllowedDynamicRange.toFixed(2)}dB).`
            : `Dynamic range floor breached (${processedDynamicRange.toFixed(2)}dB < ${minAllowedDynamicRange.toFixed(2)}dB).`,
        },
        qualityLoop: {
          enabled: true,
          attempts: enforcement.attempts,
          selectedAttempt: enforcement.selectedAttempt,
          targetLufs,
          targetDynamicRange: minAllowedDynamicRange,
          targetPeakDb: this.safetyPeakThresholdDb,
          blocked: true,
          reason: enforcement.warning,
        },
      };
    }

    // Store processed buffer
    this.processedBuffer = processedBuffer;
    audioEngine.setProcessedBuffer(processedBuffer);

    return {
      processedBuffer,
      metrics,
      appliedActions: selectedActions,
      qualityLoop: {
        enabled: true,
        attempts: enforcement.attempts,
        selectedAttempt: enforcement.selectedAttempt,
        targetLufs,
        targetDynamicRange: minAllowedDynamicRange,
        targetPeakDb: this.safetyPeakThresholdDb,
        blocked: false,
        reason: enforcement.warning,
      },
      preservation: {
        mode: preservationMode,
        originalDynamicRange,
        processedDynamicRange,
        minAllowedDynamicRange,
        hardCapDb: this.globalHardCapDb,
        wasAdjusted: boundedConfig !== config || enforcement.usedRelaxation,
        blocked: false,
        reason: enforcement.warning,
      },
    };
  }

  /**
   * Reprocess audio with modified actions (e.g., removing one action)
   */
  async reprocessAudio(
    selectedActions: ProcessingAction[],
    options: ProcessingPipelineOptions = {}
  ): Promise<ProcessingResult> {
    if (!this.originalBuffer) throw new Error('No original audio');

    // Start from original, not from processed
    audioEngine.setBuffer(this.originalBuffer);

    return this.processAudio(selectedActions, options);
  }

  private applyPreservationBounds(
    config: ProcessingConfig,
    originalDynamicRange: number,
    mode: PreservationMode
  ): ProcessingConfig {
    let mutated = false;
    const next: ProcessingConfig = { ...config };
    const ratioCap = mode === 'preserve' ? 1.6 : mode === 'balanced' ? 2.2 : 3.0;
    const compressionThresholdFloor = mode === 'preserve' ? -12 : mode === 'balanced' ? -14 : -16;
    const limiterThresholdFloor = mode === 'preserve' ? -1.0 : mode === 'balanced' ? -1.2 : -1.6;

    if (next.compression) {
      const ratio = next.compression.ratio ?? 1;
      const threshold = next.compression.threshold ?? -12;
      const drSensitiveRatioCap = originalDynamicRange <= 8 ? Math.min(ratioCap, 1.5) : ratioCap;
      const clampedRatio = Math.min(ratio, drSensitiveRatioCap);
      const clampedThreshold = Math.max(threshold, compressionThresholdFloor);
      if (clampedRatio !== ratio || clampedThreshold !== threshold) {
        mutated = true;
        next.compression = {
          ...next.compression,
          ratio: clampedRatio,
          threshold: clampedThreshold,
        };
      }
    }

    if (next.limiter) {
      const threshold = next.limiter.threshold ?? -1.0;
      const clampedThreshold = Math.max(threshold, limiterThresholdFloor);
      if (clampedThreshold !== threshold) {
        mutated = true;
        next.limiter = {
          ...next.limiter,
          threshold: clampedThreshold,
        };
      }
    }

    return mutated ? next : config;
  }

  private async renderWithQualityLoop(
    originalBuffer: AudioBuffer,
    initialConfig: ProcessingConfig,
    originalLufs: number,
    targetLufs: number,
    lufsTolerance: number,
    originalDynamicRange: number,
    minAllowedDynamicRange: number,
    attemptBudget: number,
    perceptualField?: APLPerceptualField | null,
    referenceDeltaAnalysis?: ReferenceDeltaAnalysis | null,
    referenceWorldAnalysis?: ReferenceWorldAnalysis | null
  ): Promise<{
    buffer: AudioBuffer;
    usedRelaxation: boolean;
    hadViolation: boolean;
    warning?: string;
    attempts: QualityLoopAttempt[];
    selectedAttempt: number;
  }> {
    let usedRelaxation = false;
    let warning: string | undefined;
    const attempts: QualityLoopAttempt[] = [];
    let bestAttempt: { buffer: AudioBuffer; score: number; attempt: number; candidate: string } | null = null;
    const candidates = this.buildQualityCandidates(initialConfig, perceptualField, referenceDeltaAnalysis, referenceWorldAnalysis);
    const candidateBudgets = this.distributeAttempts(attemptBudget, candidates.length);
    let globalAttempt = 0;

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      let attemptConfig = candidate.config;
      const budget = candidateBudgets[candidateIndex] ?? 1;

      for (let attemptWithinCandidate = 0; attemptWithinCandidate < budget; attemptWithinCandidate += 1) {
        globalAttempt += 1;
        const rendered = await audioEngine.renderProcessedAudio(attemptConfig, originalBuffer);
        const currentDR = calculateLoudnessRange(rendered);
        const currentLufs = await this.estimateIntegratedLUFSFast(rendered);
        const metrics = mixAnalysisService.analyzeStaticMetrics(rendered);
        const peakDb = metrics.peak;
        const reduction = originalDynamicRange - currentDR;
        const lufsDelta = Math.abs(currentLufs - targetLufs);
        const accepted = currentDR >= minAllowedDynamicRange &&
          reduction <= this.globalHardCapDb &&
          peakDb <= this.safetyPeakThresholdDb &&
          lufsDelta <= lufsTolerance;
        const score = this.scoreQualityAttempt(
          originalLufs,
          targetLufs,
          currentLufs,
          originalDynamicRange,
          currentDR,
          peakDb,
          minAllowedDynamicRange,
          perceptualField,
          referenceDeltaAnalysis,
          referenceWorldAnalysis,
        );
        const adjustments: string[] = [];
        if (peakDb > this.safetyPeakThresholdDb) adjustments.push('peak trim');
        if (currentDR < minAllowedDynamicRange) adjustments.push('dynamic relaxation');
        if (lufsDelta > lufsTolerance) adjustments.push(currentLufs < targetLufs ? 'makeup recovery' : 'gentler drive');

        attempts.push({
          attempt: globalAttempt,
          candidate: candidate.label,
          integratedLUFS: currentLufs,
          dynamicRange: currentDR,
          peakDb,
          score,
          accepted,
          adjustments,
        });

        if (!bestAttempt || score < bestAttempt.score) {
          bestAttempt = { buffer: rendered, score, attempt: globalAttempt, candidate: candidate.label };
        }

        if (accepted) {
          return { buffer: rendered, usedRelaxation, hadViolation: false, warning, attempts, selectedAttempt: globalAttempt };
        }

        usedRelaxation = true;
        warning = `[Quality Loop] ${candidate.label} attempt ${attemptWithinCandidate + 1} rejected. Relaxing dynamics before retry ${globalAttempt + 1}.`;
        attemptConfig = this.relaxProcessingPressure(attemptConfig, attemptWithinCandidate + 1);
      }
    }

    const finalRendered = bestAttempt?.buffer ?? await audioEngine.renderProcessedAudio(candidates[0]?.config ?? initialConfig, originalBuffer);
    return {
      buffer: finalRendered,
      usedRelaxation,
      hadViolation: true,
      warning: warning ?? `No safe candidate was accepted; using the best-scoring render from ${bestAttempt?.candidate ?? 'bounded baseline'}.`,
      attempts,
      selectedAttempt: bestAttempt?.attempt ?? globalAttempt,
    };
  }

  /**
   * A/B comparison: switch between original and processed
   */
  playOriginal(): void {
    if (!this.originalBuffer) throw new Error('No original audio');
    audioEngine.setBuffer(this.originalBuffer);
    this.isPlayingProcessed = false;
  }

  playProcessed(): void {
    if (!this.processedBuffer) {
      console.warn('No processed audio available, playing original');
      this.playOriginal();
      return;
    }
    audioEngine.setProcessedBuffer(this.processedBuffer);
    this.isPlayingProcessed = true;
  }

  /**
   * Get current state
   */
  getOriginalBuffer(): AudioBuffer | null {
    return this.originalBuffer;
  }

  getProcessedBuffer(): AudioBuffer | null {
    return this.processedBuffer;
  }

  isPlayingProcessedAudio(): boolean {
    return this.isPlayingProcessed;
  }

  /**
   * Clear session
   */
  reset(): void {
    this.originalBuffer = null;
    this.processedBuffer = null;
    this.isPlayingProcessed = false;
    audioEngine.setBuffer(null);
    audioEngine.setProcessedBuffer(null);
  }

  /**
   * Convert ProcessingAction[] to ProcessingConfig
   * This is the ONLY place where the conversion happens
   */
  // actionsToConfig moved to processingActionUtils.ts
}

// Singleton instance
export const audioProcessingPipeline = new AudioProcessingPipeline();
