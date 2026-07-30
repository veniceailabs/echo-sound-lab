import type { AudioMetrics, MixSignature } from '../../types';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import { clamp, mean } from '../lowend/lowEndUtils';

export type ReferenceDeltaSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface ReferenceDeltaInput {
  currentMetrics: AudioMetrics;
  referenceMetrics: AudioMetrics;
  currentSignature?: MixSignature;
  referenceSignature?: MixSignature;
  lowEnd?: LowEndDisciplineAnalysis;
  phaseCMastering?: PhaseCMasteringAnalysis;
}

export interface ReferenceDeltaAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  matchScore: number;
  loudness: {
    current: number;
    reference: number;
    delta: number;
    severity: ReferenceDeltaSeverity;
  };
  dynamics: {
    crestFactorCurrent: number;
    crestFactorReference: number;
    delta: number;
    severity: ReferenceDeltaSeverity;
  };
  tonal: {
    low: number;
    lowMid: number;
    mid: number;
    highMid: number;
    high: number;
    current: MixSignature['tonalBalance'];
    reference: MixSignature['tonalBalance'];
  };
  stereo: {
    low: number;
    mid: number;
    high: number;
    current: MixSignature['stereoWidth'];
    reference: MixSignature['stereoWidth'];
  };
  summary: string;
  recommendations: string[];
  riskNotes: string[];
  interactionNotes: string[];
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function severityFromDelta(delta: number): ReferenceDeltaSeverity {
  const abs = Math.abs(delta);
  if (abs >= 4) return 'critical';
  if (abs >= 2.5) return 'high';
  if (abs >= 1.25) return 'moderate';
  return 'low';
}

function defaultSignature(metrics: AudioMetrics): MixSignature {
  const low = clamp((metrics.spectralBalance?.low ?? 0.24), 0, 1);
  const lowMid = clamp((metrics.spectralBalance?.lowMid ?? 0.26), 0, 1);
  const mid = clamp((metrics.spectralBalance?.mid ?? 0.24), 0, 1);
  const highMid = clamp((metrics.spectralBalance?.highMid ?? 0.14), 0, 1);
  const high = clamp((metrics.spectralBalance?.high ?? 0.12), 0, 1);
  return {
    tonalBalance: { low, lowMid, mid, highMid, high },
    stereoWidth: {
      low: clamp((metrics.advancedMetrics?.stereoWidth ?? 50) / 100, 0, 1),
      mid: clamp((metrics.advancedMetrics?.stereoWidth ?? 50) / 100, 0, 1),
      high: clamp((metrics.advancedMetrics?.stereoWidth ?? 50) / 100, 0, 1),
    },
    dynamics: {
      rms: metrics.rms,
      peak: metrics.peak,
      crestFactor: metrics.crestFactor,
    },
    character: {
      brightness: clamp((metrics.spectralCentroid - 1200) / 4200, 0, 1),
      warmth: clamp(1 - (metrics.spectralCentroid - 1200) / 4200, 0, 1),
    },
  };
}

function flattenDelta(current: MixSignature['tonalBalance'], reference: MixSignature['tonalBalance']): number {
  return mean([
    current.low - reference.low,
    current.lowMid - reference.lowMid,
    current.mid - reference.mid,
    current.highMid - reference.highMid,
    current.high - reference.high,
  ].map((entry) => Math.abs(entry)));
}

export class ReferenceDeltaEngine {
  public static analyze(input: ReferenceDeltaInput): ReferenceDeltaAnalysis {
    const currentSignature = input.currentSignature ?? defaultSignature(input.currentMetrics);
    const referenceSignature = input.referenceSignature ?? defaultSignature(input.referenceMetrics);

    const loudnessDelta = (input.currentMetrics.lufs?.integrated ?? input.currentMetrics.rms + 3)
      - (input.referenceMetrics.lufs?.integrated ?? input.referenceMetrics.rms + 3);
    const crestDelta = input.currentMetrics.crestFactor - input.referenceMetrics.crestFactor;
    const tonalDelta = flattenDelta(currentSignature.tonalBalance, referenceSignature.tonalBalance);
    const stereoDelta = mean([
      Math.abs(currentSignature.stereoWidth.low - referenceSignature.stereoWidth.low),
      Math.abs(currentSignature.stereoWidth.mid - referenceSignature.stereoWidth.mid),
      Math.abs(currentSignature.stereoWidth.high - referenceSignature.stereoWidth.high),
    ]);

    const loudnessSeverity = severityFromDelta(loudnessDelta);
    const dynamicsSeverity = severityFromDelta(crestDelta);

    const tonalContribution = clamp(1 - tonalDelta / 0.25, 0, 1);
    const stereoContribution = clamp(1 - stereoDelta / 0.3, 0, 1);
    const loudnessContribution = clamp(1 - Math.abs(loudnessDelta) / 6, 0, 1);
    const dynamicsContribution = clamp(1 - Math.abs(crestDelta) / 4, 0, 1);
    const matchScore = Math.round(mean([
      tonalContribution,
      stereoContribution,
      loudnessContribution,
      dynamicsContribution,
    ]) * 100);

    const recommendations: string[] = [];
    if (Math.abs(loudnessDelta) > 1) {
      recommendations.push(loudnessDelta > 0
        ? 'Current master is louder than the reference. Back off bus gain if the transient spine starts to flatten.'
        : 'Current master is quieter than the reference. Raise level only if the transient preservation score stays intact.');
    }
    if (tonalDelta > 0.08) {
      recommendations.push('Tonal balance is drifting from the target world. Focus on broad EQ shape before chasing limiter gain.');
    }
    if (stereoDelta > 0.1) {
      recommendations.push('Stereo width is not matching closely. Keep low-end mono discipline and adjust only the upper bands.');
    }
    if (Math.abs(crestDelta) > 1) {
      recommendations.push('Dynamic contrast differs from the target. Preserve or recover transients before adding loudness.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Reference alignment is close enough to trust the current finish path.');
    }

    const riskNotes: string[] = [];
    if (Math.abs(loudnessDelta) > 2.5) riskNotes.push('Large loudness drift can create false competitiveness or blunt transients.');
    if (tonalDelta > 0.12) riskNotes.push('Broad tonal mismatch will be heard before fine detail adjustments matter.');
    if (stereoDelta > 0.16) riskNotes.push('Stereo mismatch may create width inflation or collapse relative to the target.');

    const interactionNotes: string[] = [];
    if (input.lowEnd?.shouldApply) interactionNotes.push('Low-end discipline should be resolved before treating the reference delta as final.');
    if (input.phaseCMastering?.shouldApply) interactionNotes.push('Phase C finishing can intentionally diverge from the reference if the current song needs more restraint or lift.');

    const shouldApply = Math.abs(loudnessDelta) > 0.8 || tonalDelta > 0.06 || stereoDelta > 0.08 || Math.abs(crestDelta) > 0.8;

    const summary = shouldApply
      ? 'The current mix is close to the reference world, but one or more finish dimensions still need attention.'
      : 'The current mix is living in the same target world as the reference.';

    const analysisFingerprint = fnv1aHex(stableSerialize({
      loudnessDelta,
      crestDelta,
      tonalDelta,
      stereoDelta,
      matchScore,
      reference: referenceSignature.tonalBalance,
      current: currentSignature.tonalBalance,
    }));

    return {
      shouldApply,
      analysisFingerprint,
      matchScore,
      loudness: {
        current: input.currentMetrics.lufs?.integrated ?? input.currentMetrics.rms + 3,
        reference: input.referenceMetrics.lufs?.integrated ?? input.referenceMetrics.rms + 3,
        delta: loudnessDelta,
        severity: loudnessSeverity,
      },
      dynamics: {
        crestFactorCurrent: input.currentMetrics.crestFactor,
        crestFactorReference: input.referenceMetrics.crestFactor,
        delta: crestDelta,
        severity: dynamicsSeverity,
      },
      tonal: {
        low: currentSignature.tonalBalance.low - referenceSignature.tonalBalance.low,
        lowMid: currentSignature.tonalBalance.lowMid - referenceSignature.tonalBalance.lowMid,
        mid: currentSignature.tonalBalance.mid - referenceSignature.tonalBalance.mid,
        highMid: currentSignature.tonalBalance.highMid - referenceSignature.tonalBalance.highMid,
        high: currentSignature.tonalBalance.high - referenceSignature.tonalBalance.high,
        current: currentSignature.tonalBalance,
        reference: referenceSignature.tonalBalance,
      },
      stereo: {
        low: currentSignature.stereoWidth.low - referenceSignature.stereoWidth.low,
        mid: currentSignature.stereoWidth.mid - referenceSignature.stereoWidth.mid,
        high: currentSignature.stereoWidth.high - referenceSignature.stereoWidth.high,
        current: currentSignature.stereoWidth,
        reference: referenceSignature.stereoWidth,
      },
      summary,
      recommendations,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzeReferenceDelta = ReferenceDeltaEngine.analyze.bind(ReferenceDeltaEngine);
