import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';
import {
  clamp,
  lowBandPower,
  midLowPower,
  highPassPower,
  monoMix,
  powerToDb,
} from './lowEndUtils';

export type KickBassFocusTarget = 'kick' | 'bass' | 'shared' | 'mix';
export type KickBassDominantFocus = 'sub' | 'punch' | 'body' | 'shared';

export interface KickBassFocusBand {
  band: KickBassDominantFocus;
  target: KickBassFocusTarget;
  frequencyStartHz: number;
  frequencyEndHz: number;
  gainDb: number;
  q: number;
  confidence: number;
  rationale: string;
  riskNotes: string[];
}

export interface KickBassControlAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  lowBandPowerDb: number;
  midLowPowerDb: number;
  highPassPowerDb: number;
  lowToMidRatio: number;
  lowToHighRatio: number;
  maskingScore: number;
  pocketScore: number;
  dominantFocus: KickBassDominantFocus;
  focusBands: KickBassFocusBand[];
  recommendation: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(
    arrangement.sections.reduce((sum, section) => sum + section.density, 0) / arrangement.sections.length,
    0,
    1
  );
}

function buildFocusBands(
  lowToMidRatio: number,
  lowToHighRatio: number,
  arrangementDensity: number
): KickBassFocusBand[] {
  const bands: KickBassFocusBand[] = [];
  const denseBias = arrangementDensity > 0.65 ? 0.35 : 0;

  if (lowToMidRatio > 1.1 || lowToHighRatio > 1.35) {
    bands.push({
      band: 'sub',
      target: 'kick',
      frequencyStartHz: 45,
      frequencyEndHz: 80,
      gainDb: clamp(-1.2 - (lowToMidRatio - 1) * 2.2 - denseBias, -4.5, 0),
      q: 1.1,
      confidence: clamp(0.62 + (lowToMidRatio - 1) * 0.18, 0, 1),
      rationale: 'Tighten the kick sub so it owns the deepest octave without smearing the bass body.',
      riskNotes: ['Keep the cut narrow so the song does not lose weight.'],
    });
  }

  if (lowToMidRatio > 0.92 || arrangementDensity > 0.6) {
    bands.push({
      band: 'body',
      target: 'bass',
      frequencyStartHz: 110,
      frequencyEndHz: 190,
      gainDb: clamp(-1.5 - arrangementDensity * 1.3, -4.5, 0),
      q: 0.85,
      confidence: clamp(0.58 + arrangementDensity * 0.24, 0, 1),
      rationale: 'Clear low-mid overlap so the bass body stops crowding the vocal and kick pocket.',
      riskNotes: ['Avoid a wide scoop that hollows the mix.'],
    });
  }

  if (lowToHighRatio > 1.25 && arrangementDensity > 0.55) {
    bands.push({
      band: 'punch',
      target: 'mix',
      frequencyStartHz: 190,
      frequencyEndHz: 260,
      gainDb: clamp(-1.0 - (lowToHighRatio - 1.25) * 1.5, -3.5, 0),
      q: 0.95,
      confidence: clamp(0.56 + (lowToHighRatio - 1.25) * 0.12, 0, 1),
      rationale: 'Trim low-mid mud so the kick reads as punch instead of blur.',
      riskNotes: ['Do not over-cut or the low end will lose forward motion.'],
    });
  }

  return bands;
}

export class KickBassControl {
  public static analyze(
    buffer: VocalIntakeBufferLike,
    arrangement?: ArrangementAnalysis
  ): KickBassControlAnalysis {
    const mono = monoMix(buffer);
    const lowPower = lowBandPower(mono, buffer.sampleRate);
    const midLowPowerValue = midLowPower(mono, buffer.sampleRate);
    const highPassPowerValue = highPassPower(mono, buffer.sampleRate);

    const lowBandPowerDb = powerToDb(lowPower);
    const midLowPowerDb = powerToDb(midLowPowerValue);
    const highPassPowerDb = powerToDb(highPassPowerValue);

    const lowToMidRatio = lowPower / Math.max(midLowPowerValue, 1e-12);
    const lowToHighRatio = lowPower / Math.max(highPassPowerValue, 1e-12);
    const arrangementDensity = averageDensity(arrangement);
    const lowEndFavor = lowToMidRatio < 0.9 ? 0 : (lowToMidRatio - 0.9) * 0.9;
    const arrangementPenalty = (arrangementDensity - 0.55) * 0.45;
    const highBandPenalty = lowToMidRatio > 0.9 ? Math.max(0, lowToHighRatio - 1.15) * 0.08 : 0;
    const maskingScore = clamp(lowEndFavor + arrangementPenalty + highBandPenalty, 0, 1);
    const pocketScore = clamp(
      1 - Math.abs(lowToMidRatio - 1) * 0.58 - Math.abs(arrangementDensity - 0.55) * 0.28,
      0,
      1
    );
    const shouldApply = (
      (lowToMidRatio > 0.9 && maskingScore > 0.38) ||
      (lowToMidRatio > 1.08) ||
      (arrangementDensity > 0.7 && lowToHighRatio > 1.2)
    );

    let dominantFocus: KickBassDominantFocus = 'shared';
    if (lowToMidRatio > 1.35) dominantFocus = 'sub';
    else if (lowToMidRatio > 1.05) dominantFocus = 'punch';
    else if (midLowPowerValue > lowPower * 1.15) dominantFocus = 'body';

    const focusBands = buildFocusBands(lowToMidRatio, lowToHighRatio, arrangementDensity);
    const recommendation = shouldApply
      ? (dominantFocus === 'sub'
        ? 'Tighten the deepest octave and remove low-mid overlap so the kick and bass stop masking each other.'
        : dominantFocus === 'body'
          ? 'Trim bass body and low-mid mud so the pocket stays forward and controlled.'
          : 'Refine the low-end overlap before the mix gets heavy and blurred.')
      : 'The kick and bass relationship is reasonably stable; only minor shaping is needed.';

    const riskNotes: string[] = [];
    if (arrangementDensity > 0.7) riskNotes.push('Dense arrangement leaves less room for broad low-end boosts.');
    if (lowToHighRatio > 1.35 && lowToMidRatio > 0.9) riskNotes.push('Sub energy is dominant enough to mask the punch if the cut is too broad.');
    if (pocketScore < 0.45) riskNotes.push('The current low-end pocket is uneven and may need tighter control.');

    const interactionNotes: string[] = [];
    if (focusBands.length > 0) interactionNotes.push('Use narrow moves so the low end stays authoritative instead of thin.');
    if (arrangementDensity > 0.6) interactionNotes.push('High section density means the bass should support the vocal rather than compete with it.');

    const overallConfidence = clamp(
      0.45 +
      maskingScore * 0.25 +
      pocketScore * 0.2 +
      arrangementDensity * 0.1 +
      Math.min(1, focusBands.length * 0.08),
      0,
      1
    );

    return {
      shouldApply,
      overallConfidence,
      lowBandPowerDb,
      midLowPowerDb,
      highPassPowerDb,
      lowToMidRatio,
      lowToHighRatio,
      maskingScore,
      pocketScore,
      dominantFocus,
      focusBands,
      recommendation,
      riskNotes,
      interactionNotes,
    };
  }
}
