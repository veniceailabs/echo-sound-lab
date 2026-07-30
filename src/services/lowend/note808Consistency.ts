import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';
import { clamp, monoMix, powerToDb } from './lowEndUtils';

export interface Note808WindowAnalysis {
  startTimeSec: number;
  endTimeSec: number;
  fundamentalHz: number;
  noteName: string;
  strengthDb: number;
  confidence: number;
  stable: boolean;
}

export interface Note808ConsistencyAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  dominantFundamentalHz: number;
  dominantNote: string;
  noteVarianceHz: number;
  stabilityScore: number;
  activeWindowRatio: number;
  windowNotes: Note808WindowAnalysis[];
  recommendation: string;
  riskNotes: string[];
  interactionNotes: string[];
}

const CANDIDATE_FREQUENCIES = Array.from({ length: 61 }, (_, index) => 30 + index);

function frequencyToNoteName(frequency: number): string {
  if (!Number.isFinite(frequency) || frequency <= 0) return 'unknown';
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = noteNames[((midi % 12) + 12) % 12] ?? 'unknown';
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function goertzelPower(samples: Float32Array, sampleRate: number, frequency: number): number {
  if (samples.length === 0 || frequency <= 0) return 0;
  const normalized = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(normalized);
  let sPrev = 0;
  let sPrev2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    const s = sample + coeff * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }

  return sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
}

function dominantFrequency(window: Float32Array, sampleRate: number): { frequency: number; strengthDb: number; confidence: number } {
  let bestFreq = 0;
  let bestPower = -Infinity;
  let secondPower = -Infinity;

  for (const frequency of CANDIDATE_FREQUENCIES) {
    const power = goertzelPower(window, sampleRate, frequency);
    if (power > bestPower) {
      secondPower = bestPower;
      bestPower = power;
      bestFreq = frequency;
    } else if (power > secondPower) {
      secondPower = power;
    }
  }

  const confidence = clamp((bestPower - secondPower) / Math.max(bestPower, 1e-12), 0, 1);
  return {
    frequency: bestFreq,
    strengthDb: powerToDb(bestPower),
    confidence,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function analyzeWindows(buffer: VocalIntakeBufferLike): Note808WindowAnalysis[] {
  const mono = monoMix(buffer);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(2048, Math.floor(sampleRate * 0.4));
  const hopSize = Math.max(1024, Math.floor(windowSize / 2));
  const windows: Note808WindowAnalysis[] = [];

  for (let start = 0; start + windowSize <= mono.length; start += hopSize) {
    const window = mono.subarray(start, start + windowSize);
    const rms = Math.sqrt(window.reduce((sum, sample) => sum + (sample ?? 0) ** 2, 0) / window.length);
    if (rms < 0.008) continue;

    const peak = window.reduce((max, sample) => Math.max(max, Math.abs(sample ?? 0)), 0);
    const dominant = dominantFrequency(window, sampleRate);
    const stable = dominant.confidence > 0.16 && peak > 0.04;

    windows.push({
      startTimeSec: start / sampleRate,
      endTimeSec: (start + windowSize) / sampleRate,
      fundamentalHz: dominant.frequency,
      noteName: frequencyToNoteName(dominant.frequency),
      strengthDb: dominant.strengthDb,
      confidence: dominant.confidence,
      stable,
    });
  }

  return windows;
}

export class Note808Consistency {
  public static analyze(
    buffer: VocalIntakeBufferLike,
    arrangement?: ArrangementAnalysis
  ): Note808ConsistencyAnalysis {
    const windows = analyzeWindows(buffer);
    const frequencies = windows.map((window) => window.fundamentalHz).filter((value) => value > 0);
    const dominantFundamentalHz = frequencies.length > 0 ? average(frequencies) : 0;
    const noteVarianceHz = standardDeviation(frequencies);
    const dominantNote = frequencyToNoteName(dominantFundamentalHz);
    const stableWindows = windows.filter((window) => window.stable).length;
    const activeWindowRatio = windows.length > 0 ? stableWindows / windows.length : 0;
    const arrangementDensity = arrangement && arrangement.sections.length > 0
      ? arrangement.sections.reduce((sum, section) => sum + section.density, 0) / arrangement.sections.length
      : 0.5;
    const sparseContent = activeWindowRatio < 0.22 || windows.length < 4;
    const stabilityScore = clamp(
      sparseContent
        ? 0.58 + activeWindowRatio * 0.18 + Math.max(0, 1 - Math.min(1, noteVarianceHz / 24)) * 0.12
        : 1 - (noteVarianceHz / 18) - (1 - activeWindowRatio) * 0.3 - Math.abs(arrangementDensity - 0.5) * 0.12,
      0,
      1
    );
    const shouldApply = !sparseContent && (
      stabilityScore < 0.6 ||
      noteVarianceHz > 8.5 ||
      (windows.length > 3 && new Set(windows.map((window) => window.noteName)).size > 3)
    );

    const recommendation = shouldApply
      ? `The 808 is drifting between notes; tighten the tuning center around ${dominantNote} (${dominantFundamentalHz.toFixed(1)} Hz) and reduce note-to-note drift.`
      : sparseContent
        ? 'The low-frequency content is sparse enough that 808-specific correction is not the primary concern.'
        : `The 808 reads as stable around ${dominantNote} (${dominantFundamentalHz.toFixed(1)} Hz) with acceptable consistency.`;

    const riskNotes: string[] = [];
    if (!sparseContent && noteVarianceHz > 8) riskNotes.push('Pitch movement is wide enough to feel inconsistent in the low end.');
    if (!sparseContent && stableWindows < Math.max(1, Math.floor(windows.length * 0.55))) riskNotes.push('Too few stable windows for a confidently anchored 808 line.');

    const interactionNotes: string[] = [];
    if (arrangementDensity > 0.65) interactionNotes.push('Dense arrangement makes 808 drift more obvious against the kick and vocal.');
    if (activeWindowRatio > 0.7) interactionNotes.push('Stable note windows make it easier to lock kick and bass around the same pocket.');
    if (sparseContent) interactionNotes.push('Sparse low-frequency content should be treated as neutral rather than as an unstable 808 line.');

    const overallConfidence = clamp(
      0.42 +
      stabilityScore * 0.28 +
      activeWindowRatio * 0.18 +
      Math.min(1, windows.length / 10) * 0.12,
      0,
      1
    );

    return {
      shouldApply,
      overallConfidence,
      dominantFundamentalHz,
      dominantNote,
      noteVarianceHz,
      stabilityScore,
      activeWindowRatio,
      windowNotes: windows,
      recommendation,
      riskNotes,
      interactionNotes,
    };
  }
}
