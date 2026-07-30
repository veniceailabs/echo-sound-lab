import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import { clamp, mean } from '../lowend/lowEndUtils';
import type { LoudnessWithoutCollapseAnalysis } from './loudnessWithoutCollapse';
import type { TopEndPolishAnalysis } from './topEndPolish';

export type ReferenceAnchor = 'intimate_release' | 'balanced_release' | 'impact_release';

export interface ReferenceConstrainedMasteringAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  analysisFingerprint: string;
  referenceAnchor: ReferenceAnchor;
  targetLUFS: number;
  targetTruePeakDb: number;
  targetDynamicRangeDb: number;
  targetLowBalance: { min: number; max: number; ideal: number };
  targetMidBalance: { min: number; max: number; ideal: number };
  targetHighBalance: { min: number; max: number; ideal: number };
  rationale: string;
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

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

function chooseAnchor(
  arrangement: ArrangementAnalysis | undefined,
  vocalIntent?: VocalIntentAnalysis
): ReferenceAnchor {
  if (vocalIntent?.intent === 'intimate' || vocalIntent?.intent === 'whispered') return 'intimate_release';
  if (vocalIntent?.intent === 'aggressive' || vocalIntent?.intent === 'belted') return 'impact_release';
  if (averageDensity(arrangement) > 0.68) return 'impact_release';
  return 'balanced_release';
}

export class ReferenceConstrainedMastering {
  public static analyze(
    metrics: APLSignalMetrics,
    arrangement?: ArrangementAnalysis,
    lowEnd?: LowEndDisciplineAnalysis,
    loudness?: LoudnessWithoutCollapseAnalysis,
    topEnd?: TopEndPolishAnalysis,
    vocalIntent?: VocalIntentAnalysis
  ): ReferenceConstrainedMasteringAnalysis {
    const referenceAnchor = chooseAnchor(arrangement, vocalIntent);
    const density = averageDensity(arrangement);
    const loudnessBias = referenceAnchor === 'impact_release' ? 0.5 : referenceAnchor === 'intimate_release' ? -0.4 : 0;
    const targetLUFS = clamp(-14 + loudnessBias + (density - 0.5) * 0.4, -15.5, -12.5);
    const targetTruePeakDb = -1;
    const targetDynamicRangeDb = clamp(
      referenceAnchor === 'impact_release'
        ? 6.8 + (1 - density) * 0.8
        : referenceAnchor === 'intimate_release'
          ? 9.2 + (1 - density) * 0.6
          : 7.8 + (1 - density) * 0.6,
      6.5,
      11.5
    );

    const targetLowBalance = {
      min: referenceAnchor === 'impact_release' ? 0.24 : 0.22,
      max: referenceAnchor === 'impact_release' ? 0.37 : 0.33,
      ideal: referenceAnchor === 'impact_release' ? 0.31 : 0.28,
    };
    const targetMidBalance = {
      min: 0.3,
      max: 0.46,
      ideal: 0.38,
    };
    const targetHighBalance = {
      min: referenceAnchor === 'intimate_release' ? 0.18 : 0.16,
      max: referenceAnchor === 'intimate_release' ? 0.31 : 0.28,
      ideal: referenceAnchor === 'impact_release' ? 0.24 : 0.22,
    };

    const loudnessNeed = Math.abs(metrics.loudnessLUFS - targetLUFS);
    const dynamicNeed = Math.abs(metrics.crestFactor - targetDynamicRangeDb);
    const spectralNeed = topEnd ? Math.abs(topEnd.gainDb) : 0.5;
    const lowEndNeed = lowEnd ? (lowEnd.shouldApply ? 0.4 : 0.1) : 0.25;
    const shouldApply = loudnessNeed < 8 && (dynamicNeed > 4 || spectralNeed > 1.8 || lowEndNeed > 0.6);

    const rationale = shouldApply
      ? 'The current mix should be constrained against a finish target so loudness, tone, and dynamics land in a release-safe window.'
      : 'The current mix already sits close to a release-safe target profile.';

    const riskNotes: string[] = [];
    if (loudnessNeed > 2) riskNotes.push('Loudness is far enough from target that final gain moves could alter the feel of the record.');
    if (dynamicNeed > 2) riskNotes.push('Dynamic range is far enough off target that the finish stage could sound either squeezed or too loose.');
    if (spectralNeed > 1.2) riskNotes.push('Top-end balance still needs restraint before final master decisions are locked.');

    const interactionNotes: string[] = [];
    if (lowEnd?.shouldApply) interactionNotes.push('The low end should be finalized before a reference-constrained finish is locked.');
    if (loudness && Math.abs(loudness.expectedGainDb) > 3) interactionNotes.push('Large loudness moves should be done before the reference target is finalized.');
    if (topEnd && topEnd.gainDb > 1) interactionNotes.push('Air boosts should remain broad and restrained so the reference target stays natural.');
    if (vocalIntent?.intent === 'aggressive') interactionNotes.push('Aggressive vocals can sit closer to impact_release without sounding over-finished.');

    const overallConfidence = clamp(0.44 + (1 - Math.min(1, loudnessNeed / 4)) * 0.26 + (1 - Math.min(1, dynamicNeed / 4)) * 0.24 + (1 - lowEndNeed) * 0.06, 0, 1);
    const analysisFingerprint = fnv1aHex(stableSerialize({
      referenceAnchor,
      targetLUFS,
      targetTruePeakDb,
      targetDynamicRangeDb,
      loudnessNeed,
      dynamicNeed,
      spectralNeed,
      lowEndNeed,
    }));

    return {
      shouldApply,
      overallConfidence,
      analysisFingerprint,
      referenceAnchor,
      targetLUFS,
      targetTruePeakDb,
      targetDynamicRangeDb,
      targetLowBalance,
      targetMidBalance,
      targetHighBalance,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}
