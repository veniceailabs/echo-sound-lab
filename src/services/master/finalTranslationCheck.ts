import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { SpectralProfile } from '../dsp/SpectralAnalyzer';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import { clamp, mean } from '../lowend/lowEndUtils';
import type { BusGlueAnalysis } from './busGlue';
import type { LoudnessWithoutCollapseAnalysis } from './loudnessWithoutCollapse';
import type { TopEndPolishAnalysis } from './topEndPolish';
import type { ReferenceConstrainedMasteringAnalysis } from './referenceConstrainedMastering';

export type FinalTranslationDevice = 'mono' | 'phone' | 'car' | 'airpods';

export interface FinalTranslationTarget {
  device: FinalTranslationDevice;
  score: number;
  risk: string;
  recommendation: string;
}

export interface FinalTranslationCheckAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  overallConfidence: number;
  targets: FinalTranslationTarget[];
  verdict: 'translation_ready' | 'needs_translation_work' | 'mixed';
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

function topEndClarity(topEnd: TopEndPolishAnalysis): number {
  return clamp(
    0.52 + (topEnd.gainDb / 4.5) * 0.24 + (topEnd.character === 'air' ? 0.12 : 0) - (topEnd.harshnessRisk * 0.24),
    0,
    1
  );
}

export class FinalTranslationCheck {
  public static analyze(
    metrics: APLSignalMetrics,
    spectralProfile: SpectralProfile,
    lowEnd: LowEndDisciplineAnalysis,
    busGlue: BusGlueAnalysis,
    loudness: LoudnessWithoutCollapseAnalysis,
    topEnd: TopEndPolishAnalysis,
    referenceTarget: ReferenceConstrainedMasteringAnalysis
  ): FinalTranslationCheckAnalysis {
    const loudnessAlignment = clamp(1 - Math.abs(loudness.currentLUFS - referenceTarget.targetLUFS) / 4, 0, 1);
    const monoScore = clamp(
      lowEnd.stereoLowMono.monoBelow120Score * 0.54 +
      (1 - lowEnd.kickBassControl.maskingScore) * 0.14 +
      loudnessAlignment * 0.15 +
      busGlue.overallConfidence * 0.09 +
      (1 - Math.abs(metrics.crestFactor - referenceTarget.targetDynamicRangeDb) / 10) * 0.08,
      0,
      1
    );
    const phoneScore = clamp(
      (1 - lowEnd.kickBassControl.maskingScore) * 0.24 +
      lowEnd.note808Consistency.stabilityScore * 0.22 +
      loudness.headroomScore * 0.2 +
      topEndClarity(topEnd) * 0.16 +
      busGlue.overallConfidence * 0.18,
      0,
      1
    );
    const carScore = clamp(
      lowEnd.drumPocket.pocketScore * 0.34 +
      lowEnd.stereoLowMono.monoBelow120Score * 0.28 +
      lowEnd.note808Consistency.stabilityScore * 0.2 +
      loudness.headroomScore * 0.1 +
      loudnessAlignment * 0.08,
      0,
      1
    );
    const airpodsScore = clamp(
      topEndClarity(topEnd) * 0.28 +
      loudness.headroomScore * 0.22 +
      busGlue.overallConfidence * 0.16 +
      (1 - lowEnd.kickBassControl.maskingScore) * 0.14 +
      monoScore * 0.2,
      0,
      1
    );

    const targets: FinalTranslationTarget[] = [
      {
        device: 'mono',
        score: monoScore,
        risk: monoScore < 0.7 ? 'Low-end phase spread or weak headroom may change the balance in mono.' : 'Mono collapse should hold the record together.',
        recommendation: monoScore < 0.7
          ? 'Re-center the low end and re-check width below the crossover.'
          : 'Mono playback should remain stable.',
      },
      {
        device: 'phone',
        score: phoneScore,
        risk: phoneScore < 0.7 ? 'The record may lean too hard on sub energy for small speakers.' : 'Phone playback should keep enough body and clarity.',
        recommendation: phoneScore < 0.7
          ? 'Reduce low-end masking and make the midrange read more clearly.'
          : 'The small-speaker translation is acceptable.',
      },
      {
        device: 'car',
        score: carScore,
        risk: carScore < 0.7 ? 'The low-end pocket may soften in a car cabin.' : 'The low-end pocket should stay authoritative in a car.',
        recommendation: carScore < 0.7
          ? 'Tighten the groove and keep the bass/kick image more disciplined.'
          : 'Car playback should stay anchored.',
      },
      {
        device: 'airpods',
        score: airpodsScore,
        risk: airpodsScore < 0.7 ? 'Earbud playback may expose harshness or low-end clutter.' : 'Earbud playback should stay balanced.',
        recommendation: airpodsScore < 0.7
          ? 'Reduce clutter and keep the top end smooth rather than flashy.'
          : 'Earbud playback should stay acceptable.',
      },
    ];

    const targetScores = targets.map((target) => target.score);
    const overallConfidence = clamp(0.42 + mean(targetScores) * 0.36 + loudnessAlignment * 0.1 + topEndClarity(topEnd) * 0.08, 0, 1);
    const shouldApply = targetScores.some((score) => score < 0.33) || mean(targetScores) < 0.42;

    let verdict: FinalTranslationCheckAnalysis['verdict'] = 'mixed';
    if (targetScores.every((score) => score >= 0.4)) verdict = 'translation_ready';
    else if (targetScores.some((score) => score < 0.28)) verdict = 'needs_translation_work';

    const lowestTarget = targets.reduce((lowest, target) => (target.score < lowest.score ? target : lowest), targets[0]);
    const rationale = shouldApply
      ? `The ${lowestTarget.device} check is still the weakest link, so the finish stage should be tightened before release.`
      : 'The mix is translating consistently across the major playback targets.';

    const riskNotes = targets.filter((target) => target.score < 0.33).map((target) => `${target.device} remains below the translation comfort line.`);
    if (referenceTarget.targetLUFS > -12.8) riskNotes.push('The reference target is getting loud enough that translation checks should be re-run after limiting.');
    if (spectralProfile.truePeakDB > referenceTarget.targetTruePeakDb) riskNotes.push('True peak headroom is not yet release-safe.');

    const interactionNotes: string[] = [];
    if (lowEnd.translationValidation.verdict === 'needs_translation_work') interactionNotes.push('Low-end translation is the first thing to fix before final release.');
    if (topEnd.harshnessRisk > 0.6 && topEnd.gainDb > 0) interactionNotes.push('Earbuds will expose harsh top-end decisions quickly.');
    if (busGlue.character === 'presence') interactionNotes.push('Presence-heavy bus glue can make the car and phone checks feel more aggressive.');
    if (loudness.expectedGainDb !== 0) interactionNotes.push('Re-check translation after the loudness target is applied.');
    const analysisFingerprint = fnv1aHex(stableSerialize({
      shouldApply,
      verdict,
      targets: targets.map((target) => ({ device: target.device, score: target.score, risk: target.risk })),
      referenceTarget: referenceTarget.analysisFingerprint,
      loudness: loudness.currentLUFS,
      topEnd: topEnd.gainDb,
    }));

    return {
      shouldApply,
      analysisFingerprint,
      overallConfidence,
      targets,
      verdict,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}
