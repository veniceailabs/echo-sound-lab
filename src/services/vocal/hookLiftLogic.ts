import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { DelayAutomationAnalysis } from './delayAutomationLogic';
import type { VocalContextAwarenessAnalysis } from './contextAwareness';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { VocalIntentAnalysis } from './vocalIntentDetector';
import type { VocalProfile } from './vocalProfiler';

export type HookLiftTactic = 'compress' | 'saturate' | 'widen' | 'presence' | 'reverb' | 'delay';

export interface HookLiftSetting {
  tactic: HookLiftTactic;
  parameter: string;
  value: number;
  unit: 'db' | 'ms' | 'ratio' | 'mix' | 'width' | 'hz';
}

export interface HookLiftTacticRecommendation {
  tactic: HookLiftTactic;
  amountOfLift: number;
  setting: HookLiftSetting[];
  rationale: string;
  riskNotes: string[];
}

export interface HookLiftAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  verseSectionHint: string;
  hookSectionHint: string;
  amountOfLift: number;
  verseVsHookContrast: {
    verseEnergy: number;
    hookEnergy: number;
    contrastScore: number;
    emotionalLift: string;
  };
  tactics: HookLiftTacticRecommendation[];
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  skipReason?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function normalizeSectionName(name: string): string {
  return name.toLowerCase();
}

function findSection(
  arrangement: ArrangementAnalysis | undefined,
  predicates: Array<(sectionName: string) => boolean>
): { name: string; energy: number; density: number } | null {
  if (!arrangement || arrangement.sections.length === 0) return null;
  for (const predicate of predicates) {
    const found = arrangement.sections.find((section) => predicate(normalizeSectionName(section.name)));
    if (found) {
      return {
        name: found.name,
        energy: found.energy,
        density: found.density,
      };
    }
  }
  return null;
}

function pickVerseSection(arrangement?: ArrangementAnalysis): { name: string; energy: number; density: number } {
  const named = findSection(arrangement, [
    (name) => name.includes('verse'),
    (name) => name.includes('breakdown'),
    (name) => name.includes('intro'),
    (name) => name.includes('pre-chorus'),
    (name) => name.includes('main'),
  ]);
  if (named) return named;

  if (arrangement?.sections.length) {
    const quietest = [...arrangement.sections].sort((a, b) => a.energy - b.energy)[0];
    if (quietest) {
      return { name: quietest.name, energy: quietest.energy, density: quietest.density };
    }
  }

  return { name: 'verse', energy: 0.45, density: 0.45 };
}

function pickHookSection(arrangement?: ArrangementAnalysis): { name: string; energy: number; density: number } {
  const named = findSection(arrangement, [
    (name) => name.includes('chorus'),
    (name) => name.includes('hook'),
    (name) => name.includes('drop'),
    (name) => name.includes('refrain'),
  ]);
  if (named) return named;

  if (arrangement?.sections.length) {
    const loudest = [...arrangement.sections].sort((a, b) => b.energy - a.energy)[0];
    if (loudest) {
      return { name: loudest.name, energy: loudest.energy, density: loudest.density };
    }
  }

  return { name: 'hook', energy: 0.78, density: 0.7 };
}

function computeContrastScore(verseEnergy: number, hookEnergy: number, arrangement?: ArrangementAnalysis): number {
  const energyDelta = clamp(hookEnergy - verseEnergy, 0, 1);
  const dynamicRangeBoost = arrangement ? clamp(arrangement.dynamicRange / 18, 0, 0.25) : 0.12;
  const flowBoost = arrangement?.overallFlow === 'dynamic'
    ? 0.08
    : arrangement?.overallFlow === 'building'
      ? 0.05
      : 0.02;

  return clamp(energyDelta * 0.58 + dynamicRangeBoost + flowBoost, 0, 1);
}

function movementReduction(delay: DelayAutomationAnalysis): number {
  if (!delay.shouldApply) return 0.08;
  switch (delay.primaryRecommendation?.useCase) {
    case 'hook_excitement':
      return 0.14;
    case 'ad_lib_support':
      return 0.09;
    case 'emphasis':
      return 0.07;
    default:
      return 0.08;
  }
}

function topEndLift(presenceAir: PresenceAirAnalysis): number {
  return (
    presenceAir.presenceTargets.reduce((sum, target) => sum + target.gainDb, 0) +
    presenceAir.airTargets.reduce((sum, target) => sum + target.gainDb, 0)
  );
}

function buildTactics(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  delay: DelayAutomationAnalysis,
  arrangement: ArrangementAnalysis | undefined,
  contrastScore: number,
  intent?: VocalIntentAnalysis,
  context?: VocalContextAwarenessAnalysis
): HookLiftTacticRecommendation[] {
  const tactics: HookLiftTacticRecommendation[] = [];
  const intentBias = intent
    ? intent.intent === 'aggressive' || intent.intent === 'belted'
      ? 0.08
      : intent.intent === 'intimate' || intent.intent === 'whispered'
        ? -0.08
        : intent.intent === 'melodic'
          ? 0.03
          : 0
    : 0;
  const liftNeed = clamp(contrastScore + (topEndLift(presenceAir) / 12) + movementReduction(delay) + intentBias, 0, 1);
  const hookDensity = pickHookSection(arrangement).density;
  const verseDensity = pickVerseSection(arrangement).density;
  const densityGap = clamp(hookDensity - verseDensity, 0, 1);
  const contextLiftBias = context?.hookLiftAdjustment.direction === 'increase'
    ? context.hookLiftAdjustment.amount * 0.18
    : context?.hookLiftAdjustment.direction === 'reduce'
      ? -context.hookLiftAdjustment.amount * 0.14
      : 0;

  const compressAmount = clamp(0.15 + liftNeed * 0.2 + contextLiftBias * 0.4, 0, 0.32);
  tactics.push({
    tactic: 'compress',
    amountOfLift: clamp(
      compressAmount +
      (intent?.intent === 'intimate' || intent?.intent === 'whispered' ? -0.03 : 0) +
      (intent?.intent === 'aggressive' || intent?.intent === 'belted' ? 0.03 : 0),
      0,
      0.34
    ),
    setting: [
      {
        tactic: 'compress',
        parameter: 'hook_ratio_delta',
        value: clamp(-0.2 - liftNeed * 0.3 - contextLiftBias * 0.2, -0.75, -0.08),
        unit: 'ratio',
      },
      {
        tactic: 'compress',
        parameter: 'hook_attack_delta_ms',
        value: clamp(-4 - liftNeed * 8, -18, -2),
        unit: 'ms',
      },
    ],
    rationale: 'Loosen the hook compressor slightly so the chorus breathes more than the verse without sounding uncontrolled.',
    riskNotes: [
      'Do not over-loosen the hook if the arrangement is already sparse; the contrast should feel intentional.',
    ],
  });

  const presenceAmount = clamp(0.12 + topEndLift(presenceAir) / 18 + liftNeed * 0.12 + contextLiftBias * 0.25, 0.1, 0.32);
  tactics.push({
    tactic: 'presence',
    amountOfLift: clamp(
      presenceAmount +
      (intent?.intent === 'aggressive' || intent?.intent === 'belted' ? 0.03 : 0) -
      (intent?.intent === 'intimate' || intent?.intent === 'whispered' ? 0.04 : 0),
      0.08,
      0.34
    ),
    setting: [
      {
        tactic: 'presence',
        parameter: 'hook_presence_gain_db',
        value: clamp(0.5 + liftNeed * 2.2 + contextLiftBias * 1.1, 0.4, 3.6),
        unit: 'db',
      },
    ],
    rationale: 'Give the hook a slightly more forward midrange so the chorus reads as the emotional focal point.',
    riskNotes: [
      'Keep the presence lift broad if de-essing already exposed the top end.',
      'Avoid pushing the same band too hard when the vocal is already bright.',
    ],
  });

  const widthAmount = clamp(
    0.06 + (1 - verseDensity) * 0.06 + densityGap * 0.1 +
    (context?.densityClass === 'sparse' ? 0.02 : 0) -
    (context?.densityClass === 'dense' || context?.densityClass === 'wall_of_sound' ? 0.05 : 0),
    0.05,
    0.18
  );
  tactics.push({
    tactic: 'widen',
    amountOfLift: clamp(
      widthAmount +
      (intent?.intent === 'melodic' ? 0.02 : 0) -
      (intent?.intent === 'intimate' || intent?.intent === 'whispered' ? 0.05 : 0),
      0.04,
      0.2
    ),
    setting: [
      {
        tactic: 'widen',
        parameter: 'hook_stereo_width',
        value: clamp(1.03 + liftNeed * 0.09 + (context?.densityClass === 'sparse' ? 0.02 : 0) - (context?.densityClass === 'dense' ? 0.04 : 0), 1.01, 1.14),
        unit: 'width',
      },
    ],
    rationale: 'Open the hook slightly wider than the verse so the chorus feels bigger without going phasey.',
    riskNotes: [
      'If the hook is already dense or stacked, keep width changes modest.',
      'Do not widen low end or center vocal fundamentals.',
      'Avoid phasey or artificial widening; the lift should stay musical and subtle.',
    ],
  });

  const saturationAmount = clamp(0.08 + profile.warmth * 0.05 + liftNeed * 0.08 + (context?.saturationAdjustment.direction === 'increase' ? 0.02 : 0) - (context?.saturationAdjustment.direction === 'reduce' ? 0.02 : 0), 0.06, 0.22);
  tactics.push({
    tactic: 'saturate',
    amountOfLift: clamp(
      saturationAmount +
      (intent?.intent === 'aggressive' || intent?.intent === 'belted' ? 0.03 : 0) -
      (intent?.intent === 'whispered' ? 0.03 : 0),
      0.05,
      0.2
    ),
    setting: [
      {
        tactic: 'saturate',
        parameter: 'hook_drive_db',
        value: clamp(0.5 + liftNeed * 1.55, 0.35, 2.2),
        unit: 'db',
      },
    ],
    rationale: 'Add a small amount of harmonic excitement so the hook feels more expensive and forward without sounding distorted.',
    riskNotes: [
      'Keep saturation subtle when the vocal is already sharp or breathy.',
      'Too much drive can collapse the emotional contrast you are trying to create.',
    ],
  });

  const reverbAmount = clamp(0.05 + movementReduction(delay) * 0.5 + (1 - hookDensity) * 0.06 + (context?.densityClass === 'sparse' ? 0.02 : 0) - (context?.densityClass === 'dense' ? 0.02 : 0), 0.04, 0.18);
  tactics.push({
    tactic: 'reverb',
    amountOfLift: clamp(
      reverbAmount +
      (intent?.intent === 'intimate' || intent?.intent === 'whispered' ? -0.02 : 0) +
      (intent?.intent === 'melodic' ? 0.02 : 0),
      0.03,
      0.16
    ),
    setting: [
      {
        tactic: 'reverb',
        parameter: 'hook_send_mix',
        value: clamp(0.035 + liftNeed * 0.06 + (context?.delayAdjustment.direction === 'increase' ? 0.015 : 0) - (context?.delayAdjustment.direction === 'reduce' ? 0.02 : 0), 0.025, 0.14),
        unit: 'mix',
      },
      {
        tactic: 'reverb',
        parameter: 'hook_predelay_ms',
        value: clamp(18 + liftNeed * 10, 14, 34),
        unit: 'ms',
      },
    ],
    rationale: 'A short supporting space can give the hook more size while leaving the verse more direct.',
    riskNotes: [
      'Keep the hook space short; this is lift, not wash.',
      'Avoid adding more reverb if the delay recommendation is already doing the movement work.',
    ],
  });

  if (delay.shouldApply && delay.primaryRecommendation?.useCase === 'hook_excitement') {
    tactics.push({
      tactic: 'delay',
      amountOfLift: clamp(
        0.06 + movementReduction(delay) * 0.12 +
        (intent?.intent === 'aggressive' || intent?.intent === 'belted' ? 0.02 : 0) -
        (intent?.intent === 'intimate' || intent?.intent === 'whispered' ? 0.02 : 0),
        0.05,
        0.14
      ),
      setting: [
        {
          tactic: 'delay',
          parameter: 'hook_throw_wet_delta',
          value: clamp(0.02 + movementReduction(delay) * 0.04, 0.02, 0.08),
          unit: 'mix',
        },
      ],
      rationale: 'If the hook already has a throw strategy, let the chorus lift include a controlled echo bloom rather than a larger static space.',
      riskNotes: [
        'Only reinforce the throw on the hook tail.',
        'Do not let the delay become the hook identity if the vocal already has strong presence.',
      ],
    });
  }

  return tactics.sort((a, b) => b.amountOfLift - a.amountOfLift);
}

export class VocalHookLiftLogic {
  public static analyze(
    profile: VocalProfile,
    compression: CompressionStackAnalysis,
    presenceAir: PresenceAirAnalysis,
    delay: DelayAutomationAnalysis,
    arrangement?: ArrangementAnalysis,
    intent?: VocalIntentAnalysis,
    context?: VocalContextAwarenessAnalysis
  ): HookLiftAnalysis {
    const verse = pickVerseSection(arrangement);
    const hook = pickHookSection(arrangement);
    const contrastScore = computeContrastScore(verse.energy, hook.energy, arrangement);
    const liftNeed = clamp(
      contrastScore * 0.38 +
      topEndLift(presenceAir) / 20 +
      movementReduction(delay) +
      (compression.strategy === 'single_stage' ? 0.05 : 0.02),
      0,
      1
    );

    const tactics = buildTactics(profile, compression, presenceAir, delay, arrangement, contrastScore, intent, context);

    const shouldApply = liftNeed > 0.22 || contrastScore > 0.18 || hook.energy > verse.energy + 0.08;

    if (!shouldApply) {
      return {
        shouldApply: false,
        overallConfidence: clamp(0.65 + contrastScore * 0.1, 0, 1),
        verseSectionHint: verse.name,
        hookSectionHint: hook.name,
        amountOfLift: liftNeed,
        verseVsHookContrast: {
          verseEnergy: verse.energy,
          hookEnergy: hook.energy,
          contrastScore,
          emotionalLift: 'The sections are already close enough that extra lift would be subtle rather than meaningful.',
        },
        tactics: [],
        rationale: 'The hook already has enough contrast relative to the verse, so additional lift would risk sounding forced.',
        riskNotes: [
          'Avoid making the chorus louder just for the sake of difference.',
          'If the arrangement is sparse, the natural contrast may already be sufficient.',
        ],
        interactionNotes: [
          'Compression, presence, and movement are already doing enough to separate sections.',
        ],
        skipReason: 'Hook contrast is already adequate; preserve the natural section balance.',
      };
    }

    const overallConfidence = clamp(
      0.56 +
      contrastScore * 0.2 +
      profile.voiceTypeConfidence * 0.08 +
      presenceAir.overallConfidence * 0.08 +
      (delay.shouldApply ? 0.04 : 0.02),
      0,
      1
    );

    const rationale = [
      `Hook-vs-verse contrast scored at ${(contrastScore * 100).toFixed(0)}% based on section energy and arrangement flow.`,
      `The lift plan focuses on ${tactics.map((tactic) => tactic.tactic).join(', ')} rather than brute-force loudness.`,
    ].join(' ');

    const riskNotes = [
      'Keep the lift relative, not absolute; the hook should feel more important, not merely louder.',
      'Do not widen the center vocal or the low end.',
      delay.shouldApply && delay.primaryRecommendation?.useCase === 'hook_excitement'
        ? 'Delay is already adding motion; avoid stacking too much reverb on top.'
        : 'Keep any added space short so the hook stays focused.',
    ];

    const interactionNotes = [
      `Verse section hint: ${verse.name}; hook section hint: ${hook.name}.`,
      compression.strategy === 'two_stage'
        ? 'Two-stage compression gives the verse more control, so the hook lift can be mostly about contrast.'
        : 'The current compression feel leaves room for the hook to move forward with a subtle adjustment.',
      presenceAir.warnings.length > 0
        ? 'Presence/air warnings exist; keep the hook lift broad and avoid brittle top-end boosts.'
        : 'Top-end polish is stable enough for a small chorus lift.',
    ];

    return {
      shouldApply: true,
      overallConfidence,
      verseSectionHint: verse.name,
      hookSectionHint: hook.name,
      amountOfLift: clamp(liftNeed, 0, 1),
      verseVsHookContrast: {
        verseEnergy: verse.energy,
        hookEnergy: hook.energy,
        contrastScore,
        emotionalLift: hook.energy - verse.energy > 0.15
          ? 'The hook already rises, but it still benefits from refinement so the payoff lands harder.'
          : 'The hook needs a clearer emotional step-up so the chorus feels like the destination.',
      },
      tactics,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}

export const vocalHookLiftLogic = VocalHookLiftLogic;
