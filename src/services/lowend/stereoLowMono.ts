import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';
import {
  clamp,
  correlation,
  mean,
  movingAverageLowPass,
  rmsDb,
} from './lowEndUtils';

export interface StereoLowMonoAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  lowBandCorrelation: number;
  lowBandBalance: number;
  monoBelow120Score: number;
  crossoverHz: number;
  widthReduction: number;
  shouldCollapseToMono: boolean;
  recommendation: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function lowBandRmsDb(samples: Float32Array, sampleRate: number): number {
  const low = movingAverageLowPass(samples, sampleRate, 120);
  return rmsDb(low);
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

export class StereoLowMono {
  public static analyze(
    buffer: VocalIntakeBufferLike,
    arrangement?: ArrangementAnalysis
  ): StereoLowMonoAnalysis {
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const sampleRate = buffer.sampleRate;
    const lowLeft = movingAverageLowPass(left, sampleRate, 120);
    const lowRight = movingAverageLowPass(right, sampleRate, 120);
    const lowBandCorrelation = correlation(lowLeft, lowRight);
    const lowBandBalance = clamp(1 - Math.abs(lowBandRmsDb(left, sampleRate) - lowBandRmsDb(right, sampleRate)) / 12, 0, 1);
    const monoBelow120Score = clamp(((lowBandCorrelation + 1) / 2) * 0.72 + lowBandBalance * 0.28, 0, 1);
    const arrangementDensity = averageDensity(arrangement);
    const shouldCollapseToMono = lowBandCorrelation < 0.84 || lowBandBalance < 0.82 || arrangementDensity > 0.75;
    const widthReduction = clamp((1 - monoBelow120Score) * 0.9 + arrangementDensity * 0.08, 0, 1);
    const crossoverHz = shouldCollapseToMono ? 120 : 100;
    const shouldApply = shouldCollapseToMono || monoBelow120Score < 0.9;

    const recommendation = shouldCollapseToMono
      ? 'Collapse the sub and low bass to mono below 120 Hz so the kick and bass anchor cleanly in the center.'
      : 'The low end is already centered enough for a light-width strategy; keep the crossover conservative.';

    const riskNotes: string[] = [];
    if (lowBandCorrelation < 0.8) riskNotes.push('Low-frequency phase spread is high enough to cause translation loss.');
    if (arrangementDensity > 0.7) riskNotes.push('Dense arrangement makes low-end width more risky and less forgiving.');

    const interactionNotes: string[] = [];
    if (buffer.numberOfChannels > 1) interactionNotes.push('Monophonic low end will also help the kick read the same in every playback environment.');
    if (widthReduction > 0.4) interactionNotes.push('Reduce stereo width below the crossover before applying any further low-end enhancement.');

    const overallConfidence = clamp(
      0.48 +
      monoBelow120Score * 0.26 +
      (1 - widthReduction) * 0.12 +
      (shouldCollapseToMono ? 0.1 : 0.04),
      0,
      1
    );

    return {
      shouldApply,
      overallConfidence,
      lowBandCorrelation,
      lowBandBalance,
      monoBelow120Score,
      crossoverHz,
      widthReduction,
      shouldCollapseToMono,
      recommendation,
      riskNotes,
      interactionNotes,
    };
  }
}
