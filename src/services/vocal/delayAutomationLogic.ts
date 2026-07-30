import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { VocalProfile } from './vocalProfiler';

export type DelayAutomationUseCase =
  | 'hook_excitement'
  | 'ad_lib_support'
  | 'introspective_restraint'
  | 'emphasis';

export type DelayType =
  | 'slapback'
  | 'eighth'
  | 'dotted_eighth'
  | 'quarter'
  | 'long_tail';

export interface DelayThrowRecommendation {
  useCase: DelayAutomationUseCase;
  triggerHint: string;
  triggerLocationHint: string;
  delayType: DelayType;
  tempoDivision: string;
  timeMs: number;
  feedback: number;
  wetLevel: number;
  stereoSpread: number;
  confidence: number;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

export interface DelayAutomationAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  primaryRecommendation?: DelayThrowRecommendation;
  alternateRecommendations: DelayThrowRecommendation[];
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  skipReason?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function totalTopEndLift(presenceAir: PresenceAirAnalysis): number {
  const presenceGain = presenceAir.presenceTargets.reduce((sum, target) => sum + target.gainDb, 0);
  const airGain = presenceAir.airTargets.reduce((sum, target) => sum + target.gainDb, 0);
  return presenceGain + airGain;
}

function compressionMomentum(compression: CompressionStackAnalysis): number {
  switch (compression.strategy) {
    case 'two_stage':
      return 0.34;
    case 'parallel':
      return 0.25;
    case 'hybrid':
      return 0.3;
    default:
      return 0.18;
  }
}

function movementNeed(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis
): number {
  const topEndLift = totalTopEndLift(presenceAir);
  const clarityPressure = clamp((topEndLift / 6) + (presenceAir.overallConfidence * 0.1), 0, 1);

  return clamp(
    profile.transientSharpness * 0.25 +
    clamp(profile.dynamicRangeDb / 14, 0, 1) * 0.22 +
    compressionMomentum(compression) +
    clarityPressure * 0.14 -
    profile.breathiness * 0.1 -
    profile.warmth * 0.08 -
    (presenceAir.warnings.length > 0 ? 0.05 : 0),
    0,
    1
  );
}

function restraintNeed(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis
): number {
  const gentleCompression = compression.strategy === 'single_stage' ? 0.3 : 0.12;
  const polish = clamp(totalTopEndLift(presenceAir) / 7, 0, 0.25);

  return clamp(
    profile.breathiness * 0.34 +
    profile.warmth * 0.2 +
    (1 - profile.transientSharpness) * 0.16 +
    gentleCompression +
    polish -
    (profile.dynamicRangeDb > 8 ? 0.12 : 0),
    0,
    1
  );
}

function buildHookExcitementRecommendation(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  score: number
): DelayThrowRecommendation {
  const topEndLift = totalTopEndLift(presenceAir);
  const delayType: DelayType = profile.dynamicRangeDb > 10 || compression.strategy === 'two_stage'
    ? 'quarter'
    : 'dotted_eighth';
  const timeMs = delayType === 'quarter'
    ? clamp(300 + (profile.dynamicRangeDb - 8) * 12 - topEndLift * 3, 280, 460)
    : clamp(240 + (profile.dynamicRangeDb - 7) * 8 - topEndLift * 2, 210, 360);

  return {
    useCase: 'hook_excitement',
    triggerHint: 'last syllable of the hook',
    triggerLocationHint: 'hook tail / chorus end',
    delayType,
    tempoDivision: delayType === 'quarter' ? 'quarter-note throw' : 'dotted-eighth throw',
    timeMs: Math.round(timeMs),
    feedback: clamp(0.12 + score * 0.12, 0.1, 0.28),
    wetLevel: clamp(0.16 + score * 0.12 - (presenceAir.warnings.length > 0 ? 0.03 : 0), 0.12, 0.3),
    stereoSpread: clamp(0.35 + profile.voiceTypeConfidence * 0.12, 0.3, 0.6),
    confidence: clamp(0.66 + score * 0.16 + profile.voiceTypeConfidence * 0.06, 0, 1),
    rationale: 'The hook has enough motion to benefit from a deliberate throw that blooms the phrase-ending moment without washing out the lead.',
    riskNotes: [
      'Keep the throw off the verse so the hook still feels special.',
      profile.dynamicRangeDb > 11 ? 'Large dynamics make throws obvious; keep feedback conservative.' : 'Use the throw as punctuation, not as a constant effect.',
    ],
    interactionNotes: [
      compression.strategy === 'two_stage'
        ? 'Two-stage compression already gives the vocal size, so the delay should add movement rather than size.'
        : 'Single-stage or parallel compression leaves room for a throw to create the lift.',
      totalTopEndLift(presenceAir) > 3
        ? 'Top-end polish is already present; keep the throw smooth and avoid a bright repeat.'
        : 'A medium-wet throw can carry the hook forward without crowding the center.',
    ],
  };
}

function buildAdLibRecommendation(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  score: number
): DelayThrowRecommendation {
  const delayType: DelayType = profile.breathiness > 0.55 ? 'slapback' : 'eighth';
  const timeMs = delayType === 'slapback'
    ? clamp(90 + profile.breathiness * 35 + (profile.voiceTypeConfidence * 10), 70, 150)
    : clamp(180 + profile.dynamicRangeDb * 4, 160, 270);

  return {
    useCase: 'ad_lib_support',
    triggerHint: 'ad-lib or response phrase',
    triggerLocationHint: 'ad-lib / call-and-response / side phrase',
    delayType,
    tempoDivision: delayType === 'slapback' ? 'slapback throw' : 'eighth-note throw',
    timeMs: Math.round(timeMs),
    feedback: clamp(0.08 + score * 0.1, 0.08, 0.2),
    wetLevel: clamp(0.18 + score * 0.12, 0.16, 0.35),
    stereoSpread: clamp(0.42 + (profile.breathiness * 0.18), 0.35, 0.72),
    confidence: clamp(0.64 + score * 0.14 + profile.breathiness * 0.08, 0, 1),
    rationale: 'The vocal can support a side phrase or ad-lib throw that adds movement without cluttering the center lead.',
    riskNotes: [
      'Keep the delay on supporting phrases so intelligibility stays high on the main vocal.',
      'Avoid stacking too many ad-lib throws in the same section.',
    ],
    interactionNotes: [
      compression.strategy === 'parallel'
        ? 'Parallel density keeps the lead stable, so the ad-lib can sit behind it without needing a large throw.'
        : 'A supportive throw works best when the lead is already controlled by the main compressor stack.',
      presenceAir.airTargets.length > 0
        ? 'The air shelf gives the ad-lib space, so keep the repeat more diffuse than bright.'
        : 'With less top-end lift, the throw can carry a bit more delay tone without sounding brittle.',
    ],
  };
}

function buildEmphasisRecommendation(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  score: number
): DelayThrowRecommendation {
  const delayType: DelayType = compression.strategy === 'parallel' ? 'dotted_eighth' : 'quarter';
  const timeMs = delayType === 'quarter'
    ? clamp(260 + profile.dynamicRangeDb * 8, 240, 420)
    : clamp(220 + profile.dynamicRangeDb * 6, 200, 340);

  return {
    useCase: 'emphasis',
    triggerHint: 'key lyric or phrase-ending word',
    triggerLocationHint: 'punctuation moment / phrase tail',
    delayType,
    tempoDivision: delayType === 'quarter' ? 'quarter-note throw' : 'dotted-eighth throw',
    timeMs: Math.round(timeMs),
    feedback: clamp(0.1 + score * 0.1, 0.08, 0.22),
    wetLevel: clamp(0.12 + score * 0.1, 0.1, 0.24),
    stereoSpread: clamp(0.3 + profile.voiceTypeConfidence * 0.1, 0.25, 0.5),
    confidence: clamp(0.6 + score * 0.15, 0, 1),
    rationale: 'A phrasing accent or lyric punctuation point can benefit from a modest throw that marks the moment without taking over the mix.',
    riskNotes: [
      'Use the throw only on the emphasized word so the effect reads as intentional.',
      'If the arrangement is already dense, keep feedback at the low end of the range.',
    ],
    interactionNotes: [
      'This works best when the vocal already feels stable and the effect is used for punctuation rather than constant motion.',
      totalTopEndLift(presenceAir) > 2.5
        ? 'The upper-band polish is already present, so keep the repeat slightly darker than the lead.'
        : 'The vocal is still somewhat dry, so a small repeat can add dimension without sounding over-processed.',
    ],
  };
}

function buildRestraintResponse(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  score: number
): DelayAutomationAnalysis {
  const reason = profile.breathiness > 0.5
    ? 'The vocal already reads intimate and open, so delay would push it away from the listener.'
    : 'The vocal is controlled enough that keeping it dry preserves the emotional center better than a throw.';

  return {
    shouldApply: false,
    overallConfidence: clamp(0.72 + score * 0.1, 0, 1),
    alternateRecommendations: [],
    rationale: [
      reason,
      `Compression strategy (${compression.strategy}) and presence/air behavior do not need movement to carry the phrase.`,
    ].join(' '),
    riskNotes: [
      'Delay would reduce intimacy more than it would add energy in this case.',
      'Leave the lead centered and direct so the vocal remains personal on small speakers.',
    ],
    interactionNotes: [
      presenceAir.airTargets.length > 0
        ? 'Top-end polish is already doing enough; another throw would likely over-state the phrase.'
        : 'The chain is already restrained, so the better choice is no throw rather than a timid one.',
    ],
    skipReason: 'Keep the vocal dry; the performance already has enough intimacy and polish.',
  };
}

export class VocalDelayAutomationLogic {
  public static analyze(
    profile: VocalProfile,
    compression: CompressionStackAnalysis,
    presenceAir: PresenceAirAnalysis
  ): DelayAutomationAnalysis {
    const movement = movementNeed(profile, compression, presenceAir);
    const restraint = restraintNeed(profile, compression, presenceAir);

    if (restraint > 0.7 && movement < 0.45) {
      return buildRestraintResponse(profile, compression, presenceAir, restraint);
    }

    const topEndLift = totalTopEndLift(presenceAir);
    const primaryUseCase: DelayAutomationUseCase =
      profile.breathiness > 0.14 && topEndLift > 0.8 && movement > 0.3 && profile.transientSharpness < 0.55
        ? 'ad_lib_support'
        : movement > 0.66 || profile.dynamicRangeDb > 10 || compression.strategy === 'two_stage'
          ? 'hook_excitement'
          : 'emphasis';

    const primaryRecommendation =
      primaryUseCase === 'hook_excitement'
        ? buildHookExcitementRecommendation(profile, compression, presenceAir, movement)
        : primaryUseCase === 'ad_lib_support'
          ? buildAdLibRecommendation(profile, compression, presenceAir, movement)
          : buildEmphasisRecommendation(profile, compression, presenceAir, movement);

    const alternateRecommendations: DelayThrowRecommendation[] = [];
    if (primaryUseCase !== 'hook_excitement') {
      alternateRecommendations.push(buildHookExcitementRecommendation(profile, compression, presenceAir, movement * 0.7));
    }
    if (primaryUseCase !== 'ad_lib_support') {
      alternateRecommendations.push(buildAdLibRecommendation(profile, compression, presenceAir, movement * 0.55));
    }
    if (primaryUseCase !== 'emphasis') {
      alternateRecommendations.push(buildEmphasisRecommendation(profile, compression, presenceAir, movement * 0.45));
    }

    const riskNotes = [
      primaryUseCase === 'hook_excitement'
        ? 'Keep the throw tied to the hook tail so it does not blur the verse.'
        : primaryUseCase === 'ad_lib_support'
          ? 'Support phrases can pile up quickly; avoid overlapping throws.'
          : 'Punctuation throws should stay sparse so the effect feels intentional.',
      presenceAir.airTargets.length > 0 || presenceAir.presenceTargets.length > 0
        ? 'The vocal already has polish; keep the delay repeat darker and quieter than the lead.'
        : 'A more open repeat is possible, but still keep the return behind the vocal.',
    ];

    const interactionNotes = [
      compression.strategy === 'two_stage'
        ? 'Two-stage compression gives enough density that the delay should add motion rather than size.'
        : compression.strategy === 'parallel'
          ? 'Parallel compression preserves the lead, so delay can sit behind it without losing definition.'
          : 'Single-stage compression leaves space for a carefully placed throw, but the wet level should stay modest.',
      presenceAir.warnings.length > 0
        ? 'Presence/air warnings are already present; use a darker repeat or no repeat on the brightest phrases.'
        : 'Top-end shaping is stable enough to tolerate a tasteful throw.',
    ];

    return {
      shouldApply: true,
      overallConfidence: clamp(
        0.58 +
        movement * 0.22 +
        profile.voiceTypeConfidence * 0.1 +
        (compression.strategy === 'two_stage' ? 0.04 : 0.02),
        0,
        1
      ),
      primaryRecommendation,
      alternateRecommendations,
      rationale: [
        `Delay movement scored at ${(movement * 100).toFixed(0)}% based on vocal intensity, compression feel, and top-end polish.`,
        `Primary use case selected as ${primaryUseCase.replace('_', ' ')}.`,
      ].join(' '),
      riskNotes,
      interactionNotes,
    };
  }
}

export const vocalDelayAutomationLogic = VocalDelayAutomationLogic;
