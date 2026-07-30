import type { DeEssingAnalysis } from './deEssingZones';
import type { VocalIntakeConditioningReport } from './intakeConditioning';
import type { VocalProfile } from './vocalProfiler';

export type CompressionGoal = 'transient_control' | 'glue' | 'density' | 'energy';
export type CompressionStrategy = 'single_stage' | 'two_stage' | 'parallel' | 'hybrid';
export type DeEssingPlacement = 'before' | 'between' | 'after' | 'not_needed';

export interface CompressionStageRecommendation {
  name: string;
  goal: CompressionGoal;
  ratio: number;
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
  mix: number;
  description: string;
}

export interface CompressionAlternateStack {
  name: string;
  strategy: CompressionStrategy;
  stages: CompressionStageRecommendation[];
  rationale: string;
  tradeoffs: string[];
  riskNotes: string[];
}

export interface CompressionStackOrdering {
  deEssingPlacement: DeEssingPlacement;
  rationale: string;
}

export interface CompressionStackAnalysis {
  strategy: CompressionStrategy;
  primaryStack: CompressionStageRecommendation[];
  alternateStacks: CompressionAlternateStack[];
  rationale: string;
  tradeoffs: string[];
  riskNotes: string[];
  ordering: CompressionStackOrdering;
  confidence: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function averageDeEssingIntensity(analysis?: DeEssingAnalysis): number {
  if (!analysis || !analysis.zones.length) return 0;
  const weighted = analysis.zones.reduce((sum, zone) => sum + zone.intensity * zone.confidence, 0);
  return clamp(weighted / analysis.zones.length, 0, 1);
}

function computeCompressionDemand(profile: VocalProfile, conditioning: VocalIntakeConditioningReport, deEssing: DeEssingAnalysis): number {
  const dynamicPressure = clamp((profile.dynamicRangeDb - 5) / 12, 0, 1);
  const transientPressure = clamp(profile.transientSharpness, 0, 1);
  const tightnessPressure = clamp(1 - profile.tightness, 0, 1);
  const breathinessPressure = clamp(profile.breathiness, 0, 1);
  const conditioningPressure = clamp(
    Math.abs(conditioning.gainStaging.gainAppliedDb) / 6 +
    (conditioning.micProximity.compensationNeeded ? 0.12 : 0) +
    (conditioning.dynamics.needsDynamicNormalization ? 0.08 : 0),
    0,
    1
  );
  const deEssingPressure = averageDeEssingIntensity(deEssing);

  return clamp(
    dynamicPressure * 0.32 +
    transientPressure * 0.24 +
    tightnessPressure * 0.16 +
    breathinessPressure * 0.08 +
    conditioningPressure * 0.12 +
    deEssingPressure * 0.08,
    0,
    1
  );
}

function determineOrdering(profile: VocalProfile, deEssing: DeEssingAnalysis): CompressionStackOrdering {
  if (!deEssing.shouldApply || deEssing.zones.length === 0) {
    return {
      deEssingPlacement: 'not_needed',
      rationale: 'No concentrated sibilance was detected, so de-essing should remain optional or downstream of compression only if needed.',
    };
  }

  const topZone = deEssing.zones[0];
  if (topZone.recommendation.eqType === 'static' || topZone.intensity > 0.68 || topZone.prominence > 0.7) {
    return {
      deEssingPlacement: 'before',
      rationale: 'Strong, localized sibilance should be controlled before the compressor makes it more obvious.',
    };
  }

  if (profile.breathiness > 0.6 || topZone.consonants.includes('sh')) {
    return {
      deEssingPlacement: 'between',
      rationale: 'Moderate sibilance benefits from a light de-ess between stages so the first stage can stabilize the vocal before fine-tuning the top end.',
    };
  }

  return {
    deEssingPlacement: 'after',
    rationale: 'The vocal is controlled enough that de-essing can follow compression without over-shaping the tone.',
  };
}

function buildGentleSingleStage(profile: VocalProfile, conditioning: VocalIntakeConditioningReport): CompressionStageRecommendation[] {
  const attackMs = profile.transientSharpness > 0.5 ? 4 : 8;
  const releaseMs = profile.breathiness > 0.55 ? 120 : 180;
  return [{
    name: 'Gentle control',
    goal: 'transient_control',
    ratio: profile.voiceType === 'soprano' || profile.voiceType === 'alto' ? 2 : 2.25,
    thresholdDb: clamp(-18 - profile.dynamicRangeDb * 0.35 - Math.max(0, conditioning.gainStaging.gainAppliedDb * 0.15), -28, -8),
    attackMs,
    releaseMs,
    makeupDb: clamp(1.5 + profile.dynamicRangeDb * 0.12, 0.5, 4),
    mix: 1,
    description: 'Single-stage compression for a natural, open vocal that only needs light control.',
  }];
}

function buildTwoStageStack(profile: VocalProfile, deEssing: DeEssingAnalysis): CompressionStageRecommendation[] {
  const deEssingIntensity = averageDeEssingIntensity(deEssing);
  const fastAttack = profile.transientSharpness > 0.6 ? 1.5 : 2.5;
  const slowAttack = profile.breathiness > 0.5 ? 30 : 45;
  const releaseBias = profile.tightness > 0.6 ? 85 : 120;

  return [
    {
      name: 'Peak catcher',
      goal: 'transient_control',
      ratio: clamp(3.5 + profile.transientSharpness * 3 + deEssingIntensity * 0.8, 3, 7),
      thresholdDb: clamp(-22 - profile.dynamicRangeDb * 0.4, -32, -12),
      attackMs: fastAttack,
      releaseMs: clamp(45 + profile.dynamicRangeDb * 4, 40, 120),
      makeupDb: 0,
      mix: 1,
      description: 'Fast stage for transient control and peak shaving without flattening the whole performance.',
    },
    {
      name: 'Glue stage',
      goal: 'glue',
      ratio: clamp(1.8 + (1 - profile.tightness) * 0.9, 1.6, 2.8),
      thresholdDb: clamp(-26 - profile.breathiness * 4, -34, -16),
      attackMs: slowAttack,
      releaseMs: releaseBias,
      makeupDb: clamp(1 + profile.warmth * 1.2, 0.5, 3.5),
      mix: 1,
      description: 'Slower follow-up stage that glues the vocal together after the fast stage has caught peaks.',
    },
  ];
}

function buildParallelStack(profile: VocalProfile, conditioning: VocalIntakeConditioningReport): CompressionStageRecommendation[] {
  return [
    {
      name: 'Parallel body',
      goal: 'density',
      ratio: 4,
      thresholdDb: clamp(-24 - profile.dynamicRangeDb * 0.25, -30, -14),
      attackMs: 2,
      releaseMs: clamp(75 + conditioning.micProximity.proximityEffect * 20, 70, 140),
      makeupDb: 0,
      mix: 0.35,
      description: 'Parallel compression for density and consistency while preserving the dry vocal transients.',
    },
    {
      name: 'Tone glue',
      goal: 'glue',
      ratio: clamp(1.7 + profile.tightness * 0.5, 1.6, 2.3),
      thresholdDb: clamp(-20 - profile.dynamicRangeDb * 0.3, -30, -12),
      attackMs: profile.breathiness > 0.55 ? 25 : 18,
      releaseMs: clamp(100 + profile.dynamicRangeDb * 6, 100, 220),
      makeupDb: clamp(1 + profile.warmth * 1.5, 0.5, 3),
      mix: 1,
      description: 'Serial follow-up stage for glue after the parallel path adds density and control.',
    },
  ];
}

function buildHybridAlternates(
  profile: VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  deEssing: DeEssingAnalysis
): CompressionAlternateStack[] {
  return [
    {
      name: 'Transparency-first alternate',
      strategy: 'single_stage',
      stages: buildGentleSingleStage(profile, conditioning),
      rationale: 'Best when the vocal already feels controlled and you want to preserve breath and width.',
      tradeoffs: ['Less peak insurance than a two-stage stack', 'May not add enough density for aggressive performances'],
      riskNotes: ['Can leave strong consonants slightly exposed if de-essing is weak.'],
    },
    {
      name: 'Density-first alternate',
      strategy: 'parallel',
      stages: buildParallelStack(profile, conditioning),
      rationale: 'Best when the vocal needs more size and authority without sounding clamped.',
      tradeoffs: ['Takes more setup than a single stage', 'Can blur articulation if the parallel blend is too high'],
      riskNotes: ['Use de-essing before or between stages when the top zone is highly concentrated.'],
    },
    {
      name: 'Control-first alternate',
      strategy: 'two_stage',
      stages: buildTwoStageStack(profile, deEssing),
      rationale: 'Best when the vocal is dynamic or aggressive and needs a clean handoff from peak control to glue.',
      tradeoffs: ['More compression coloration than a transparent chain', 'Can feel smaller if over-driven'],
      riskNotes: ['Monitor the first stage threshold to avoid flattening the lead too early.'],
    },
  ];
}

export class VocalCompressionStackLogic {
  public static analyze(
    profile: VocalProfile,
    conditioning: VocalIntakeConditioningReport,
    deEssing: DeEssingAnalysis
  ): CompressionStackAnalysis {
    const demand = computeCompressionDemand(profile, conditioning, deEssing);
    const aggressiveIntent = profile.transientSharpness > 0.6 || profile.tightness < 0.45 || profile.dynamicRangeDb > 11;
    const parallelLean = (
      (profile.voiceType === 'bass' || profile.voiceType === 'baritone' || profile.warmth > 0.55) &&
      demand < 0.65
    );
    const lowCompressionNeed = (
      !deEssing.shouldApply &&
      demand < 0.25 &&
      profile.dynamicRangeDb < 4.8 &&
      profile.transientSharpness < 0.24 &&
      profile.breathiness < 0.15
    );
    const controlFirstNeed = (
      demand > 0.5 ||
      profile.dynamicRangeDb > 8.5 ||
      (deEssing.shouldApply && deEssing.overallConfidence > 0.7 && profile.transientSharpness > 0.25)
    );

    let strategy: CompressionStrategy;
    let primaryStack: CompressionStageRecommendation[];

    if (lowCompressionNeed) {
      strategy = 'single_stage';
      primaryStack = buildGentleSingleStage(profile, conditioning);
    } else if (aggressiveIntent || controlFirstNeed) {
      strategy = controlFirstNeed && deEssing.shouldApply ? 'two_stage' : (parallelLean && profile.breathiness < 0.5 ? 'parallel' : 'two_stage');
      primaryStack = strategy === 'parallel'
        ? buildParallelStack(profile, conditioning)
        : buildTwoStageStack(profile, deEssing);
    } else if (profile.dynamicRangeDb > 8.5) {
      strategy = 'two_stage';
      primaryStack = buildTwoStageStack(profile, deEssing);
    } else if (parallelLean) {
      strategy = 'parallel';
      primaryStack = buildParallelStack(profile, conditioning);
    } else {
      strategy = 'single_stage';
      primaryStack = buildGentleSingleStage(profile, conditioning);
    }

    const ordering = determineOrdering(profile, deEssing);
    const alternateStacks = buildHybridAlternates(profile, conditioning, deEssing);

    const tradeoffs = strategy === 'single_stage'
      ? ['Simpler and more transparent', 'Less peak insurance than multi-stage control']
      : strategy === 'parallel'
        ? ['Adds density without crushing transients', 'Requires careful blend management']
        : ['Best control and glue balance', 'More coloration and more setup complexity'];

    const riskNotes = [
      profile.breathiness > 0.6 ? 'Watch for breath pumping if attack times are too fast.' : 'Keep attack times away from zero to avoid dulling consonants.',
      deEssing.shouldApply && ordering.deEssingPlacement === 'before'
        ? 'De-ess before compression to avoid exciting harshness.'
        : 'If the chain feels dull, move the de-esser after the main compressor or reduce its range.',
      profile.voiceTypeConfidence < 0.55 ? 'Low voice-type confidence: prefer conservative ratios until more context is available.' : 'Voice classification is stable enough to support the chosen stack.',
    ];

    const rationale = [
      `Compression demand scored at ${(demand * 100).toFixed(0)}% based on dynamic range, transients, conditioning, and de-essing load.`,
      `The vocal reads as ${profile.voiceType}${profile.voiceTypeConfidence > 0 ? ` (${(profile.voiceTypeConfidence * 100).toFixed(0)}% confidence)` : ''}.`,
      strategy === 'single_stage'
        ? 'A single gentle compressor preserves openness and avoids over-shaping an already controlled performance.'
        : strategy === 'parallel'
          ? 'Parallel compression adds density and energy while keeping the dry vocal natural.'
          : 'A two-stage chain gives peak control first, then glue and tone shaping without forcing one compressor to do everything.',
    ].join(' ');

    return {
      strategy,
      primaryStack,
      alternateStacks,
      rationale,
      tradeoffs,
      riskNotes,
      ordering,
      confidence: clamp(
        0.55 +
          demand * 0.22 +
          profile.voiceTypeConfidence * 0.12 +
          (deEssing.shouldApply ? 0.05 : 0.08),
        0,
        1
      ),
    };
  }
}

export const vocalCompressionStackLogic = VocalCompressionStackLogic;
