import type { VocalIntakeBufferLike, VocalIntakeConditioningReport } from './intakeConditioning';
import type { VocalProfile } from './vocalProfiler';

export interface DeEssingRecommendation {
  eqType: 'dynamic' | 'static';
  frequency: number;
  gainReduction: number;
  Q: number;
  thresholdDb?: number;
  ratio?: number;
}

export interface DeEssingZone {
  frequencyStart: number;
  frequencyEnd: number;
  intensity: number;
  prominence: number;
  consonants: string[];
  confidence: number;
  rationale: string;
  recommendation: DeEssingRecommendation;
}

export interface DeEssingAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  skipReason?: string;
  zones: DeEssingZone[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function monoMix(buffer: VocalIntakeBufferLike): Float32Array {
  const mono = new Float32Array(buffer.length);
  const channels = Math.max(1, buffer.numberOfChannels);
  for (let ch = 0; ch < channels; ch += 1) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += channel[i] ?? 0;
    }
  }
  for (let i = 0; i < mono.length; i += 1) {
    mono[i] /= channels;
  }
  return mono;
}

function findLoudestWindow(samples: Float32Array, windowSize = 4096): Float32Array {
  if (samples.length <= windowSize) return samples.slice();
  const hop = Math.max(1, Math.floor(windowSize / 4));
  let bestStart = 0;
  let bestEnergy = 0;
  for (let start = 0; start <= samples.length - windowSize; start += hop) {
    let energy = 0;
    for (let i = 0; i < windowSize; i += 1) {
      const sample = samples[start + i] ?? 0;
      energy += sample * sample;
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }
  return samples.slice(bestStart, bestStart + windowSize);
}

function goertzelPower(samples: Float32Array, sampleRate: number, frequency: number): number {
  if (samples.length === 0) return 0;
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let sPrev = 0;
  let sPrev2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = (samples[i] ?? 0) + coeff * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  return sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
}

function averagePower(samples: Float32Array, sampleRate: number, frequencies: number[]): number {
  if (frequencies.length === 0) return 0;
  return frequencies.reduce((sum, frequency) => sum + goertzelPower(samples, sampleRate, frequency), 0) / frequencies.length;
}

function bandScore(samples: Float32Array, sampleRate: number, band: [number, number]): number {
  const frequencies: number[] = [];
  for (let freq = band[0]; freq <= band[1]; freq += 250) {
    frequencies.push(freq);
  }
  return averagePower(samples, sampleRate, frequencies);
}

function estimateSibilanceZone(
  centerFrequency: number,
  bandScoreValue: number,
  adjacentScore: number,
  profile: VocalProfile,
  conditioning: VocalIntakeConditioningReport
): DeEssingZone | null {
  const ratio = bandScoreValue / Math.max(adjacentScore, 1e-9);
  const prominence = clamp((ratio - 1) / 1.5, 0, 1);
  const intensity = clamp(
    prominence * 0.65 +
    profile.transientSharpness * 0.2 +
    (1 - profile.breathiness) * 0.15,
    0,
    1
  );

  const airyBias = profile.breathiness > 0.68 && ratio < 1.45;
  const minProminence = airyBias ? (centerFrequency >= 7600 ? 0.48 : 0.34) : 0.24;
  const minIntensity = airyBias ? 0.32 : 0.2;

  if (prominence < minProminence || intensity < minIntensity) {
    return null;
  }

  const confidence = clamp(
    prominence * 0.55 +
    profile.voiceTypeConfidence * 0.15 +
    profile.tightness * 0.1 +
    (conditioning.micProximity.compensationNeeded ? 0.08 : 0) +
    (airyBias ? -0.18 : 0),
    0,
    1
  );

  const eqType: 'dynamic' | 'static' = confidence > 0.9 && intensity > 0.72 ? 'static' : 'dynamic';
  const gainReduction = clamp(2 + intensity * 5.5, 1.5, 8);
  const frequencyStart = clamp(centerFrequency - 900, 3500, 9500);
  const frequencyEnd = clamp(centerFrequency + 900, frequencyStart + 400, 11000);
  const consonants = centerFrequency < 6000
    ? ['sh', 'ch']
    : centerFrequency < 8000
      ? ['s']
      : ['s', 'z'];

  return {
    frequencyStart,
    frequencyEnd,
    intensity,
    prominence,
    consonants,
    confidence,
    rationale: airyBias
      ? 'Airy energy is present, but the band ratio is not strong enough for aggressive de-essing.'
      : 'Detected a concentrated sibilant band above the surrounding vocal spectrum.',
    recommendation: {
      eqType,
      frequency: centerFrequency,
      gainReduction,
      Q: centerFrequency < 6500 ? 3.5 : 4.5,
      thresholdDb: -28 + intensity * 8,
      ratio: eqType === 'static' ? 4 + intensity * 4 : 2.5 + intensity * 2,
    },
  };
}

export class VocalDeEssingZoneDetector {
  public static analyze(
    buffer: VocalIntakeBufferLike,
    profile: VocalProfile,
    conditioning: VocalIntakeConditioningReport
  ): DeEssingAnalysis {
    const mono = monoMix(buffer);
    const window = findLoudestWindow(mono, Math.min(4096, Math.max(1024, Math.floor(buffer.sampleRate * 0.08))));
    const sampleRate = buffer.sampleRate;

    const sBand = bandScore(mono, sampleRate, [5200, 8800]);
    const airyBand = bandScore(mono, sampleRate, [9000, 12000]);
    const presenceBand = bandScore(mono, sampleRate, [2000, 5000]);
    const lowPresenceBand = bandScore(mono, sampleRate, [1200, 2500]);
    const sibilanceRatio = sBand / Math.max(presenceBand + lowPresenceBand, 1e-9);
    const airyRatio = airyBand / Math.max(sBand, 1e-9);

    if (sibilanceRatio < 0.3) {
      return {
        shouldApply: false,
        overallConfidence: clamp(0.22 + profile.voiceTypeConfidence * 0.15, 0, 1),
        skipReason: 'Profile indicates airy brightness, but not enough concentrated sibilance to justify de-essing.',
        zones: [],
      };
    }

    const zones: DeEssingZone[] = [];

    const candidates: Array<{ center: number; band: [number, number]; adjacent: number }> = [
      { center: 5200, band: [4200, 6200], adjacent: bandScore(window, sampleRate, [2500, 4000]) },
      { center: 6800, band: [6200, 7600], adjacent: bandScore(window, sampleRate, [4200, 5600]) },
      { center: 8500, band: [7600, 9800], adjacent: bandScore(window, sampleRate, [5600, 7200]) },
    ];

    for (const candidate of candidates) {
      const candidateScore = bandScore(window, sampleRate, candidate.band);
      const zone = estimateSibilanceZone(
        candidate.center,
        candidateScore * (candidate.center >= 8000 ? 0.92 + airyRatio * 0.08 : 1),
        candidate.adjacent,
        profile,
        conditioning
      );
      if (zone) zones.push(zone);
    }

    zones.sort((a, b) => b.confidence - a.confidence || b.intensity - a.intensity);

    const overallConfidence = zones.length > 0
      ? zones.reduce((sum, zone) => sum + zone.confidence, 0) / zones.length
      : clamp(0.18 + profile.voiceTypeConfidence * 0.1, 0, 1);

    return {
      shouldApply: zones.length > 0 && overallConfidence >= 0.35,
      overallConfidence,
      zones,
    };
  }
}

export const vocalDeEssingZoneDetector = VocalDeEssingZoneDetector;
