import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';
import { clamp, lowBandPower, mean, powerToDb, rmsDb, stdDev } from './lowEndUtils';

export type DrumPocketClass = 'tight' | 'punchy' | 'loose' | 'uneven';

export interface DrumPocketWindow {
  startTimeSec: number;
  endTimeSec: number;
  rmsDb: number;
  peakDb: number;
  peakToRms: number;
  lowBandDb: number;
}

export interface DrumPocketAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  transientWeightScore: number;
  pocketScore: number;
  rhythmicConsistency: number;
  pocketClass: DrumPocketClass;
  windows: DrumPocketWindow[];
  recommendation: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

function classifyPocket(pocketScore: number, transientWeightScore: number, rhythmicConsistency: number): DrumPocketClass {
  if (pocketScore > 0.74 && rhythmicConsistency > 0.7) return 'tight';
  if (transientWeightScore > 0.62 && rhythmicConsistency > 0.55) return 'punchy';
  if (rhythmicConsistency < 0.42 || pocketScore < 0.38) return 'uneven';
  return 'loose';
}

export class DrumPocketLogic {
  public static analyze(
    buffer: VocalIntakeBufferLike,
    arrangement?: ArrangementAnalysis
  ): DrumPocketAnalysis {
    const mono = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const analysisWindows: DrumPocketWindow[] = [];
    const windowSize = Math.max(1024, Math.floor(sampleRate * 0.08));
    const hopSize = Math.max(256, Math.floor(windowSize / 2));

    for (let start = 0; start + windowSize <= mono.length; start += hopSize) {
      const window = mono.subarray(start, start + windowSize);
      const peak = window.reduce((max, sample) => Math.max(max, Math.abs(sample ?? 0)), 0);
      const rms = Math.sqrt(window.reduce((sum, sample) => sum + (sample ?? 0) ** 2, 0) / window.length);
      const lowDb = powerToDb(lowBandPower(window, sampleRate));
      analysisWindows.push({
        startTimeSec: start / sampleRate,
        endTimeSec: (start + windowSize) / sampleRate,
        rmsDb: rmsDb(window),
        peakDb: powerToDb(Math.max(peak * peak, 1e-12)),
        peakToRms: peak / Math.max(rms, 1e-8),
        lowBandDb: lowDb,
      });
    }

    const activeWindows = analysisWindows.filter((window) => window.rmsDb > -90 && window.peakToRms > 0);
    const analysisSet = activeWindows.length >= 4 ? activeWindows : analysisWindows;
    const peakToRmsValues = analysisSet.map((window) => window.peakToRms);
    const lowBandValues = analysisSet.map((window) => window.lowBandDb);
    const windowRms = analysisSet.map((window) => window.rmsDb);
    const sparseRhythm = activeWindows.length < 8 || (analysisSet.length > 0 && stdDev(windowRms) < 1.1 && mean(peakToRmsValues) < 1.8);
    const transientWeightScore = clamp((mean(peakToRmsValues) / 5.2) + (stdDev(peakToRmsValues) < 1.2 ? 0.08 : 0), 0, 1);
    const lowBandConsistency = clamp(1 - stdDev(lowBandValues) / 8, 0, 1);
    const rhythmicConsistency = clamp(
      sparseRhythm
        ? 0.52 + mean(peakToRmsValues) * 0.04
        : 1 - stdDev(windowRms) / 9,
      0,
      1
    );
    const arrangementDensity = averageDensity(arrangement);
    const pocketScore = clamp(
      rhythmicConsistency * 0.42 +
      transientWeightScore * 0.32 +
      lowBandConsistency * 0.16 +
      (1 - Math.abs(arrangementDensity - 0.55)) * 0.1,
      0,
      1
    );
    const pocketClass = classifyPocket(pocketScore, transientWeightScore, rhythmicConsistency);
    const shouldApply = !sparseRhythm && (pocketClass !== 'tight' || pocketScore < 0.58 || lowBandConsistency < 0.58);

    const recommendation = shouldApply
      ? (pocketClass === 'uneven'
        ? 'The low-end pocket is uneven; tighten the transient envelope and stabilize the kick-to-bass relationship.'
        : pocketClass === 'loose'
          ? 'The pocket is a little loose; add a touch more transient discipline so the low end lands with more authority.'
          : 'The low end has punch but could still use a little more pocket discipline.')
      : 'The drum pocket is already tight and well anchored.';

    const riskNotes: string[] = [];
    if (analysisWindows.length < 4) riskNotes.push('Too few analysis windows were available to fully trust pocket symmetry.');
    if (!sparseRhythm && lowBandConsistency < 0.55) riskNotes.push('Low-band energy is inconsistent enough to weaken the groove.');
    if (!sparseRhythm && transientWeightScore > 0.8 && pocketClass !== 'tight') riskNotes.push('Transient energy is strong but not yet balanced by the pocket.');
    if (sparseRhythm) riskNotes.push('Sparse rhythmic content should be treated as neutral rather than as a pocket failure.');

    const interactionNotes: string[] = [];
    if (arrangementDensity > 0.65) interactionNotes.push('Dense arrangement makes pocket discipline more important for translation.');
    if (pocketClass === 'tight') interactionNotes.push('A tight pocket gives the vocal more room to stay intelligible.');
    if (sparseRhythm) interactionNotes.push('Ignore long silent tails when judging the drum pocket; they are not part of the groove.');

    const overallConfidence = clamp(
      0.44 +
      pocketScore * 0.28 +
      rhythmicConsistency * 0.16 +
      lowBandConsistency * 0.12,
      0,
      1
    );

    return {
      shouldApply,
      overallConfidence,
      transientWeightScore,
      pocketScore,
      rhythmicConsistency,
      pocketClass,
      windows: analysisWindows,
      recommendation,
      riskNotes,
      interactionNotes,
    };
  }
}
