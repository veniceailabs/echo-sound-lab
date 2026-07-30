import type { AlbumAuthorityAnalysis } from './albumAuthorityEngine';
import type { FinishLoopAnalysis } from './finishLoopEngine';
import type { PerceptualConsequenceAnalysis } from './perceptualConsequenceEngine';
import type { ReferenceDeltaAnalysis } from './referenceDeltaEngine';
import type { SessionFinishAuthorityAnalysis } from './sessionFinishAuthority';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import type { PitchCorrectionConfig } from '../../types';
import { clamp, mean } from '../lowend/lowEndUtils';

export type ReferenceWorldProfileId =
  | 'lyrical_clarity'
  | 'commercial_rap_polish'
  | 'melodic_rnb_showcase'
  | 'balanced_modern_release';

export interface ReferenceWorldProfile {
  id: ReferenceWorldProfileId;
  label: string;
  aliases: string[];
  description: string;
  vocalForwardnessTarget: number;
  brightnessCorridor: [number, number];
  dynamicTolerance: [number, number];
  hookLiftTarget: [number, number];
  widthTarget: [number, number];
  adlibDepthStyle: 'tight' | 'supportive' | 'wide';
  lowEndWeight: [number, number];
  translationPriority: 'maximum' | 'high' | 'balanced';
  finishAggression: [number, number];
  pitchPreset: PitchCorrectionConfig;
  studioNotes: string[];
}

export interface ReferenceWorldScore {
  profileId: ReferenceWorldProfileId;
  label: string;
  score: number;
  delta: number;
  summary: string;
  recommendation: string;
}

export interface ReferenceWorldAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  bestProfileId: ReferenceWorldProfileId;
  bestProfile: ReferenceWorldProfile;
  profileScores: ReferenceWorldScore[];
  recommendedPitchPreset: PitchCorrectionConfig;
  summary: string;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

export interface ReferenceWorldInput {
  referenceDelta?: ReferenceDeltaAnalysis;
  phaseCMastering?: PhaseCMasteringAnalysis;
  lowEnd?: LowEndDisciplineAnalysis;
  vocalIntent?: VocalIntentAnalysis;
  sessionFinish?: SessionFinishAuthorityAnalysis;
  album?: AlbumAuthorityAnalysis;
  finishLoop?: FinishLoopAnalysis;
  perceptualConsequence?: PerceptualConsequenceAnalysis;
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

function intentForwardness(intent?: VocalIntentAnalysis): number {
  if (!intent) return 0.55;
  switch (intent.intent) {
    case 'intimate':
      return 0.58;
    case 'aggressive':
      return 0.82;
    case 'melodic':
      return 0.74;
    case 'conversational':
      return 0.66;
    case 'whispered':
      return 0.48;
    case 'belted':
      return 0.86;
    default:
      return 0.62;
  }
}

function brightnessFromSignal(input: ReferenceWorldInput): number {
  const topEnd = input.phaseCMastering?.topEndPolish;
  const referenceDelta = input.referenceDelta;
  const brightnessComponents = [
    topEnd ? clamp((topEnd.gainDb + 1.8) / 3.8, 0, 1) : 0.5,
    referenceDelta ? clamp(1 - Math.abs(referenceDelta.tonal.highMid) * 4, 0, 1) : 0.5,
    referenceDelta ? clamp(1 - Math.abs(referenceDelta.tonal.high) * 5, 0, 1) : 0.5,
    input.phaseCMastering ? clamp(input.phaseCMastering.overallConfidence, 0, 1) : 0.5,
  ];
  return clamp(mean(brightnessComponents), 0, 1);
}

function dynamicsFromSignal(input: ReferenceWorldInput): number {
  const phaseC = input.phaseCMastering;
  const referenceDelta = input.referenceDelta;
  const lowEnd = input.lowEnd;
  const source = [
    phaseC ? clamp(1 - Math.abs(phaseC.loudnessControl.expectedGainDb) / 8, 0, 1) : 0.5,
    referenceDelta ? clamp(1 - Math.abs(referenceDelta.dynamics.delta) / 4, 0, 1) : 0.5,
    lowEnd ? clamp(lowEnd.drumPocket.pocketScore, 0, 1) : 0.5,
  ];
  return clamp(mean(source), 0, 1);
}

function widthFromSignal(input: ReferenceWorldInput): number {
  const phaseC = input.phaseCMastering;
  const referenceDelta = input.referenceDelta;
  return clamp(mean([
    phaseC ? clamp(phaseC.finalTranslation.targets.reduce((sum, target) => sum + target.score, 0) / (phaseC.finalTranslation.targets.length * 100), 0, 1) : 0.5,
    referenceDelta ? clamp(referenceDelta.stereo.mid + referenceDelta.stereo.high, 0, 1) / 2 : 0.5,
    input.finishLoop ? clamp(input.finishLoop.translationAuthority.targets.reduce((sum, target) => sum + target.score, 0) / (input.finishLoop.translationAuthority.targets.length * 10), 0, 1) : 0.5,
  ]), 0, 1);
}

function lowEndWeightFromSignal(input: ReferenceWorldInput): number {
  const lowEnd = input.lowEnd;
  const album = input.album;
  return clamp(mean([
    lowEnd ? clamp(lowEnd.translationValidation.overallConfidence, 0, 1) : 0.5,
    album ? clamp(album.consistencyScore / 100, 0, 1) : 0.5,
    input.sessionFinish ? clamp(input.sessionFinish.authorityScore / 100, 0, 1) : 0.5,
  ]), 0, 1);
}

function scoreProfile(profile: ReferenceWorldProfile, input: ReferenceWorldInput): ReferenceWorldScore {
  const vocal = intentForwardness(input.vocalIntent);
  const brightness = brightnessFromSignal(input);
  const dynamics = dynamicsFromSignal(input);
  const width = widthFromSignal(input);
  const lowEnd = lowEndWeightFromSignal(input);

  const forwardnessScore = 1 - Math.abs(vocal - profile.vocalForwardnessTarget);
  const brightnessScore = profile.brightnessCorridor[0] <= brightness && brightness <= profile.brightnessCorridor[1]
    ? 1
    : clamp(1 - Math.min(
        Math.abs(brightness - profile.brightnessCorridor[0]),
        Math.abs(brightness - profile.brightnessCorridor[1])
      ) * 2.5, 0, 1);
  const dynamicsScore = profile.dynamicTolerance[0] <= dynamics && dynamics <= profile.dynamicTolerance[1]
    ? 1
    : clamp(1 - Math.min(
        Math.abs(dynamics - profile.dynamicTolerance[0]),
        Math.abs(dynamics - profile.dynamicTolerance[1])
      ) * 2.5, 0, 1);
  const hookScore = input.finishLoop
    ? clamp(input.finishLoop.finishScore / 10, 0, 1)
    : (input.sessionFinish ? clamp(input.sessionFinish.authorityScore / 100, 0, 1) : 0.65);
  const widthScore = profile.widthTarget[0] <= width && width <= profile.widthTarget[1]
    ? 1
    : clamp(1 - Math.min(
        Math.abs(width - profile.widthTarget[0]),
        Math.abs(width - profile.widthTarget[1])
      ) * 2.5, 0, 1);
  const lowEndScore = profile.lowEndWeight[0] <= lowEnd && lowEnd <= profile.lowEndWeight[1]
    ? 1
    : clamp(1 - Math.min(
        Math.abs(lowEnd - profile.lowEndWeight[0]),
        Math.abs(lowEnd - profile.lowEndWeight[1])
      ) * 2.5, 0, 1);

  const translationScore = input.referenceDelta
    ? clamp(input.referenceDelta.matchScore / 100, 0, 1)
    : 0.65;
  const finishAggressionScore = input.phaseCMastering
    ? clamp(input.phaseCMastering.overallConfidence, 0, 1)
    : 0.65;

  const rawScore = (
    forwardnessScore * 0.2 +
    brightnessScore * 0.14 +
    dynamicsScore * 0.12 +
    hookScore * 0.12 +
    widthScore * 0.1 +
    lowEndScore * 0.12 +
    translationScore * 0.15 +
    finishAggressionScore * 0.05
  ) * 100;

  const score = Math.round(clamp(rawScore, 0, 100));
  const delta = Math.round((score - 85) * 10) / 10;

  const summary = score >= 88
    ? `${profile.label} is a strong match for this finish.`
    : score >= 78
      ? `${profile.label} is close, but a few shaping moves still separate it from the target lane.`
      : `${profile.label} is not the best fit yet.`;

  const recommendation = score >= 88
    ? 'The current finish is already living in this lane.'
    : 'Use the finish loop to tighten the lane-specific details before locking.';

  return {
    profileId: profile.id,
    label: profile.label,
    score,
    delta,
    summary,
    recommendation,
  };
}

function defaultPitchPreset(profile: ReferenceWorldProfile): PitchCorrectionConfig {
  return { ...profile.pitchPreset };
}

export const REFERENCE_WORLD_PROFILES: ReferenceWorldProfile[] = [
  {
    id: 'lyrical_clarity',
    label: 'Lyrical Clarity',
    aliases: ['Cole / Wale lane'],
    description: 'Mid-forward, grounded, articulate, and restrained.',
    vocalForwardnessTarget: 0.66,
    brightnessCorridor: [0.36, 0.55],
    dynamicTolerance: [0.54, 0.76],
    hookLiftTarget: [0.45, 0.62],
    widthTarget: [0.28, 0.5],
    adlibDepthStyle: 'tight',
    lowEndWeight: [0.38, 0.62],
    translationPriority: 'maximum',
    finishAggression: [0.42, 0.66],
    pitchPreset: { enabled: true, mode: 'chromatic', key: 'C', scale: 'chromatic', strength: 18, retuneSpeed: 52, humanize: 84, formantPreserve: true },
    studioNotes: [
      'Keep the vocal forward but never shiny.',
      'Let consonants stay legible at low volume.',
      'Protect the groove; do not over-widen the hook.'
    ],
  },
  {
    id: 'commercial_rap_polish',
    label: 'Commercial Rap Polish',
    aliases: ['Big Sean lane'],
    description: 'Bright, forward, energetic, and radio-ready without brittleness.',
    vocalForwardnessTarget: 0.78,
    brightnessCorridor: [0.48, 0.68],
    dynamicTolerance: [0.48, 0.7],
    hookLiftTarget: [0.58, 0.78],
    widthTarget: [0.34, 0.58],
    adlibDepthStyle: 'supportive',
    lowEndWeight: [0.46, 0.68],
    translationPriority: 'high',
    finishAggression: [0.58, 0.8],
    pitchPreset: { enabled: true, mode: 'scale', key: 'G', scale: 'minor', strength: 26, retuneSpeed: 40, humanize: 74, formantPreserve: true },
    studioNotes: [
      'Push the lead forward without harshness.',
      'The hook can lift, but the top end must stay smooth.',
      'Dense low-end needs strict mono discipline.'
    ],
  },
  {
    id: 'melodic_rnb_showcase',
    label: 'Melodic R&B Showcase',
    aliases: ['Chris Brown lane'],
    description: 'Smoother lead vocal, wider hooks, cleaner air band, and musical depth.',
    vocalForwardnessTarget: 0.7,
    brightnessCorridor: [0.55, 0.75],
    dynamicTolerance: [0.44, 0.66],
    hookLiftTarget: [0.66, 0.84],
    widthTarget: [0.42, 0.68],
    adlibDepthStyle: 'wide',
    lowEndWeight: [0.4, 0.62],
    translationPriority: 'high',
    finishAggression: [0.46, 0.7],
    pitchPreset: { enabled: true, mode: 'scale', key: 'E', scale: 'minor', strength: 32, retuneSpeed: 28, humanize: 66, formantPreserve: true },
    studioNotes: [
      'Keep the lead smooth and expressive.',
      'Let the hook bloom without sounding detached.',
      'Use more width, but protect the vocal center.'
    ],
  },
  {
    id: 'balanced_modern_release',
    label: 'Balanced Modern Release',
    aliases: ['General release lane'],
    description: 'A neutral release target for songs that should not lean too far into any one lane.',
    vocalForwardnessTarget: 0.67,
    brightnessCorridor: [0.44, 0.62],
    dynamicTolerance: [0.5, 0.72],
    hookLiftTarget: [0.52, 0.72],
    widthTarget: [0.35, 0.6],
    adlibDepthStyle: 'supportive',
    lowEndWeight: [0.42, 0.66],
    translationPriority: 'maximum',
    finishAggression: [0.5, 0.74],
    pitchPreset: { enabled: true, mode: 'chromatic', key: 'C', scale: 'chromatic', strength: 22, retuneSpeed: 46, humanize: 78, formantPreserve: true },
    studioNotes: [
      'This is the default lane when the song does not demand a specific benchmark world.',
      'Preserve intent first, polish second.',
      'Translation should never be sacrificed for hype.'
    ],
  },
];

function stableWorldFingerprint(input: ReferenceWorldInput, scores: ReferenceWorldScore[]): string {
  return fnv1aHex(stableSerialize({
    scores: scores.map((score) => ({ id: score.profileId, score: score.score, delta: score.delta })),
    reference: input.referenceDelta?.analysisFingerprint,
    phaseC: input.phaseCMastering?.finalTranslation.analysisFingerprint,
    lowEnd: input.lowEnd?.analysisFingerprint,
    finishLoop: input.finishLoop?.analysisFingerprint,
  }));
}

export class ReferenceWorldEngine {
  public static analyze(input: ReferenceWorldInput): ReferenceWorldAnalysis {
    const profileScores = REFERENCE_WORLD_PROFILES.map((profile) => scoreProfile(profile, input))
      .sort((a, b) => b.score - a.score);
    const bestProfile = REFERENCE_WORLD_PROFILES.find((profile) => profile.id === profileScores[0].profileId) ?? REFERENCE_WORLD_PROFILES[0];

    const shouldApply = profileScores[0].score < 88 || (input.finishLoop?.verdict ?? 'FAIL') !== 'PASS';

    const rationale = profileScores[0].score >= 88
      ? `The current finish lives closest to ${bestProfile.label}.`
      : `The current finish is still drifting between benchmark worlds.`;

    const summary = `${bestProfile.label} is the strongest lane match at ${profileScores[0].score}/100.`;

    const riskNotes = Array.from(new Set([
      ...(input.referenceDelta?.riskNotes ?? []).slice(0, 2),
      ...(input.phaseCMastering?.riskNotes ?? []).slice(0, 2),
      ...(input.lowEnd?.riskNotes ?? []).slice(0, 2),
      ...(input.finishLoop?.riskNotes ?? []).slice(0, 2),
    ]));

    const interactionNotes = Array.from(new Set([
      ...(input.referenceDelta?.interactionNotes ?? []).slice(0, 2),
      ...(input.phaseCMastering?.interactionNotes ?? []).slice(0, 2),
      ...(input.lowEnd?.interactionNotes ?? []).slice(0, 2),
      ...(input.finishLoop?.interactionNotes ?? []).slice(0, 2),
    ]));

    const analysisFingerprint = stableWorldFingerprint(input, profileScores);

    return {
      shouldApply,
      analysisFingerprint,
      bestProfileId: bestProfile.id,
      bestProfile,
      profileScores,
      recommendedPitchPreset: defaultPitchPreset(bestProfile),
      summary,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzeReferenceWorld = ReferenceWorldEngine.analyze.bind(ReferenceWorldEngine);
export const resolveReferenceWorldPitchPreset = (profileId: ReferenceWorldProfileId): PitchCorrectionConfig => {
  const profile = REFERENCE_WORLD_PROFILES.find((entry) => entry.id === profileId) ?? REFERENCE_WORLD_PROFILES[0];
  return { ...profile.pitchPreset };
};
