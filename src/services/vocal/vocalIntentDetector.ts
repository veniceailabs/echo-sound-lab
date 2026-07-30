import type { VocalIntakeConditioningReport } from './intakeConditioning';
import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { DelayAutomationAnalysis } from './delayAutomationLogic';
import type { VocalProfile } from './vocalProfiler';

export type VocalIntent =
  | 'intimate'
  | 'aggressive'
  | 'melodic'
  | 'conversational'
  | 'whispered'
  | 'belted';

export interface VocalIntentIndicators {
  proximity: number;
  dynamicsIntensity: number;
  breathing: number;
  aggression: number;
  melodicFocus: number;
  warmth: number;
}

export interface VocalIntentCompressionImpact {
  recommended_ratio: number;
  recommended_style: 'transparent' | 'musical' | 'glue' | 'aggressive';
  reasoning: string;
}

export interface VocalIntentSaturationImpact {
  recommended_drive: number;
  reasoning: string;
}

export interface VocalIntentPresenceImpact {
  needs_presence_boost: boolean;
  reason: string;
}

export interface VocalIntentAnalysis {
  intent: VocalIntent;
  confidence: number;
  indicators: VocalIntentIndicators;
  compressionImpact: VocalIntentCompressionImpact;
  saturationImpact: VocalIntentSaturationImpact;
  presenceImpact: VocalIntentPresenceImpact;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  skipReason?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function topEndLift(presenceAir: PresenceAirAnalysis): number {
  return (
    presenceAir.presenceTargets.reduce((sum, target) => sum + target.gainDb, 0) +
    presenceAir.airTargets.reduce((sum, target) => sum + target.gainDb, 0)
  );
}

function computeIndicators(
  profile: VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  delay: DelayAutomationAnalysis
): VocalIntentIndicators {
  const pitchSpan = Math.max(0, profile.fundamentalRange.maxHz - profile.fundamentalRange.minHz);
  const melodicRange = clamp(pitchSpan / Math.max(profile.fundamentalRange.medianHz, 1), 0, 1);
  const polarityBoost = delay.shouldApply && delay.primaryRecommendation?.useCase === 'hook_excitement' ? 0.08 : 0;

  return {
    proximity: clamp(
      conditioning.micProximity.proximityEffect * 0.62 +
      profile.warmth * 0.18 +
      (profile.voiceTypeConfidence > 0.7 ? 0.08 : 0.12),
      0,
      1
    ),
    dynamicsIntensity: clamp(
      profile.dynamicRangeDb / 14 * 0.55 +
      profile.transientSharpness * 0.45,
      0,
      1
    ),
    breathing: clamp(profile.breathiness, 0, 1),
    aggression: clamp(
      profile.transientSharpness * 0.44 +
      (1 - profile.breathiness) * 0.22 +
      (1 - profile.warmth) * 0.12 +
      (compression.strategy === 'two_stage' ? 0.06 : 0.02) +
      polarityBoost,
      0,
      1
    ),
    melodicFocus: clamp(
      melodicRange * 0.42 +
      profile.voiceTypeConfidence * 0.25 +
      profile.warmth * 0.2 +
      (topEndLift(presenceAir) < 2 ? 0.06 : 0) -
      profile.transientSharpness * 0.12,
      0,
      1
    ),
    warmth: profile.warmth,
  };
}

function scoreIntents(indicators: VocalIntentIndicators, compression: CompressionStackAnalysis): Record<VocalIntent, number> {
  const dynamicsBalance = clamp(1 - Math.abs(indicators.dynamicsIntensity - 0.5) * 1.2, 0, 1);
  const compressionBias = compression.strategy === 'parallel' ? 0.05 : 0;

  return {
    intimate: clamp(
      indicators.proximity * 0.34 +
      indicators.breathing * 0.28 +
      indicators.breathing * 0.1 +
      (1 - indicators.aggression) * 0.18 +
      (1 - indicators.dynamicsIntensity) * 0.1,
      0,
      1
    ),
    aggressive: clamp(
      indicators.aggression * 0.46 +
      indicators.dynamicsIntensity * 0.2 +
      (1 - indicators.breathing) * 0.18 +
      (1 - indicators.warmth) * 0.08 +
      compressionBias,
      0,
      1
    ),
    melodic: clamp(
      indicators.melodicFocus * 0.46 +
      indicators.breathing * 0.1 +
      dynamicsBalance * 0.12 +
      0.22,
      0,
      1
    ),
    conversational: clamp(
      dynamicsBalance * 0.32 +
      (1 - indicators.aggression) * 0.24 +
      (1 - indicators.melodicFocus) * 0.16 +
      indicators.proximity * 0.1 +
      0.12,
      0,
      1
    ),
    whispered: clamp(
      indicators.breathing * 0.42 +
      (1 - indicators.dynamicsIntensity) * 0.2 +
      (1 - indicators.aggression) * 0.2 +
      indicators.proximity * 0.12,
      0,
      1
    ),
    belted: clamp(
      indicators.dynamicsIntensity * 0.38 +
      indicators.aggression * 0.26 +
      (1 - indicators.breathing) * 0.16 +
      0.16,
      0,
      1
    ),
  };
}

function inferIntent(
  profile: VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  delay: DelayAutomationAnalysis
): { intent: VocalIntent; confidence: number; indicators: VocalIntentIndicators; scoreMap: Record<VocalIntent, number> } {
  const indicators = computeIndicators(profile, conditioning, compression, presenceAir, delay);
  const scoreMap = scoreIntents(indicators, compression);

  if (indicators.breathing > 0.58 && indicators.dynamicsIntensity < 0.5 && indicators.proximity > 0.2) {
    scoreMap.intimate += 0.22;
    scoreMap.conversational -= 0.05;
  }
  if (indicators.aggression > 0.5 && indicators.breathing < 0.35 && indicators.dynamicsIntensity > 0.45) {
    scoreMap.aggressive += 0.18;
  }
  if (indicators.dynamicsIntensity > 0.78 && profile.voiceTypeConfidence > 0.8 && indicators.aggression > 0.62) {
    scoreMap.belted += 0.2;
  }
  if (indicators.melodicFocus > 0.58 && indicators.aggression < 0.6) {
    scoreMap.melodic += 0.15;
  }
  if (indicators.breathing > 0.7 && indicators.dynamicsIntensity < 0.35) {
    scoreMap.whispered += 0.18;
  }
  if (Math.abs(indicators.dynamicsIntensity - 0.5) < 0.1 && indicators.aggression < 0.55 && indicators.melodicFocus < 0.6) {
    scoreMap.conversational += 0.15;
  }

  const ranked = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]) as Array<[VocalIntent, number]>;
  const [winner, winnerScore] = ranked[0] ?? ['conversational', 0.25];
  const secondScore = ranked[1]?.[1] ?? 0.1;
  const confidence = clamp(0.5 + (winnerScore - secondScore) * 0.5 + winnerScore * 0.2, 0, 1);

  return {
    intent: winner,
    confidence,
    indicators,
    scoreMap,
  };
}

function buildCompressionImpact(intent: VocalIntent, compression: CompressionStackAnalysis): VocalIntentCompressionImpact {
  switch (intent) {
    case 'intimate':
      return {
        recommended_ratio: clamp(1.9 + (compression.strategy === 'single_stage' ? 0.1 : 0), 1.6, 2.4),
        recommended_style: 'transparent',
        reasoning: 'Keep compression gentle so the performance stays close and emotional.',
      };
    case 'aggressive':
      return {
        recommended_ratio: clamp(3.8 + (compression.strategy === 'two_stage' ? 0.4 : 0), 3.2, 5),
        recommended_style: 'aggressive',
        reasoning: 'Use firmer control so transients stay contained without losing energy.',
      };
    case 'melodic':
      return {
        recommended_ratio: clamp(2.4 + (compression.strategy === 'parallel' ? 0.2 : 0), 2, 3.2),
        recommended_style: 'musical',
        reasoning: 'Prioritize a musical compressor feel that supports pitch and phrase shape.',
      };
    case 'whispered':
      return {
        recommended_ratio: 1.8,
        recommended_style: 'transparent',
        reasoning: 'Preserve the fragility of the performance by avoiding over-control.',
      };
    case 'belted':
      return {
        recommended_ratio: clamp(3.4 + (compression.strategy === 'two_stage' ? 0.3 : 0), 3, 4.8),
        recommended_style: 'glue',
        reasoning: 'Belted lines need peak control and musical glue so they land cleanly.',
      };
    default:
      return {
        recommended_ratio: 2.3,
        recommended_style: 'musical',
        reasoning: 'Keep the vocal balanced and readable.',
      };
  }
}

function buildSaturationImpact(intent: VocalIntent, profile: VocalProfile): VocalIntentSaturationImpact {
  switch (intent) {
    case 'intimate':
      return {
        recommended_drive: clamp(0.5 + profile.warmth * 0.4, 0.3, 1.2),
        reasoning: 'Use very light saturation so the intimacy stays intact.',
      };
    case 'aggressive':
      return {
        recommended_drive: clamp(2.2 + (1 - profile.warmth) * 0.8, 1.4, 3.8),
        reasoning: 'A little grit helps the delivery read with authority.',
      };
    case 'melodic':
      return {
        recommended_drive: clamp(1.2 + profile.warmth * 0.3, 0.8, 2),
        reasoning: 'A musical edge can help the note sustain feel intentional.',
      };
    case 'whispered':
      return {
        recommended_drive: 0.6,
        reasoning: 'Keep harmonic enhancement minimal so the breath stays natural.',
      };
    case 'belted':
      return {
        recommended_drive: clamp(1.8 + (1 - profile.breathiness) * 0.4, 1.2, 3),
        reasoning: 'A controlled amount of drive gives the belt more size without harshness.',
      };
    default:
      return {
        recommended_drive: 1,
        reasoning: 'Use a restrained amount of color.',
      };
  }
}

function buildPresenceImpact(intent: VocalIntent, presenceAir: PresenceAirAnalysis): VocalIntentPresenceImpact {
  const topEnd = topEndLift(presenceAir);
  switch (intent) {
    case 'intimate':
      return {
        needs_presence_boost: topEnd < 1.8,
        reason: 'Keep presence modest; intimate delivery usually loses its center if you push the upper mids too hard.',
      };
    case 'aggressive':
      return {
        needs_presence_boost: topEnd < 2.8,
        reason: 'Aggressive delivery can benefit from a clearer forward band if the vocal is not already brittle.',
      };
    case 'melodic':
      return {
        needs_presence_boost: topEnd < 2.2,
        reason: 'Melodic lines often need enough presence for pitch and lyric clarity without sounding sharp.',
      };
    case 'whispered':
      return {
        needs_presence_boost: false,
        reason: 'Whispered delivery usually wants polish and air restraint rather than an obvious presence lift.',
      };
    case 'belted':
      return {
        needs_presence_boost: topEnd < 2.5,
        reason: 'Belted vocals need clarity, but only if the top end is not already exposed.',
      };
    default:
      return {
        needs_presence_boost: topEnd < 2,
        reason: 'Use presence only when the vocal needs to cut through the mix.',
      };
  }
}

export class VocalIntentDetector {
  public static analyze(
    profile: VocalProfile,
    conditioning: VocalIntakeConditioningReport,
    compression: CompressionStackAnalysis,
    presenceAir: PresenceAirAnalysis,
    delay: DelayAutomationAnalysis
  ): VocalIntentAnalysis {
    const { intent, confidence, indicators, scoreMap } = inferIntent(profile, conditioning, compression, presenceAir, delay);
    const compressionImpact = buildCompressionImpact(intent, compression);
    const saturationImpact = buildSaturationImpact(intent, profile);
    const presenceImpact = buildPresenceImpact(intent, presenceAir);

    const topEnd = topEndLift(presenceAir);
    const sortedScores = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
    const runnerUp = sortedScores[1]?.[0] ?? 'conversational';
    const riskNotes: string[] = [];

    if (intent === 'intimate') {
      riskNotes.push('Keep the chain close and avoid over-brightening an already personal performance.');
    }
    if (intent === 'aggressive') {
      riskNotes.push('Aggressive delivery can become brittle if compression and top-end lift both push too hard.');
    }
    if (intent === 'whispered') {
      riskNotes.push('Whispered lines can sound thin if presence or saturation is overdone.');
    }
    if (intent === 'belted') {
      riskNotes.push('Belts need control, but too much control will flatten the power that makes them work.');
    }

    if (topEnd > 3 && presenceImpact.needs_presence_boost) {
      riskNotes.push('The vocal already has a lot of upper-band energy; keep any presence change broad and small.');
    }

    const interactionNotes = [
      `Detected intent ${intent} outranked ${runnerUp} with the current profile and arrangement context.`,
      `Compression strategy ${compression.strategy} and delay use case ${delay.primaryRecommendation?.useCase ?? 'none'} are aligned against the intent score.`,
      `Indicators: proximity ${indicators.proximity.toFixed(2)}, dynamics ${indicators.dynamicsIntensity.toFixed(2)}, breathing ${indicators.breathing.toFixed(2)}, aggression ${indicators.aggression.toFixed(2)}, melodic focus ${indicators.melodicFocus.toFixed(2)}.`,
    ];

    return {
      intent,
      confidence,
      indicators,
      compressionImpact,
      saturationImpact,
      presenceImpact,
      rationale: [
        `Intent classification scored ${Math.round(confidence * 100)}% confidence from vocal behavior rather than voice type alone.`,
        `The chain should lean into ${compressionImpact.recommended_style} compression and ${intent === 'whispered' ? 'minimal' : 'intent-aware'} color.`,
      ].join(' '),
      riskNotes,
      interactionNotes,
    };
  }
}

export const vocalIntentDetector = VocalIntentDetector;
