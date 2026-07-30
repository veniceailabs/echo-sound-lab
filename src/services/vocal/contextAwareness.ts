import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { DelayAutomationAnalysis } from './delayAutomationLogic';
import type { HookLiftAnalysis } from './hookLiftLogic';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { AdLibPlacementAnalysis } from './adlibPlacement';
import type { VocalIntentAnalysis } from './vocalIntentDetector';
import type { VocalProfile } from './vocalProfiler';

export type ArrangementDensityClass = 'sparse' | 'moderate' | 'dense' | 'wall_of_sound';
export type ContextAdjustmentDirection =
  | 'tighten'
  | 'loosen'
  | 'increase'
  | 'reduce'
  | 'narrow'
  | 'widen'
  | 'deepen'
  | 'bring_forward'
  | 'keep_as_is';

export interface VocalContextAdjustment {
  direction: ContextAdjustmentDirection;
  amount: number;
  rationale: string;
}

export interface VocalSpaceBand {
  startHz: number;
  endHz: number;
  confidence: number;
  rationale: string;
}

export interface VocalContextAwarenessAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  densityScore: number;
  densityClass: ArrangementDensityClass;
  frequencyMasking: {
    lowEnd: number;
    midRange: number;
    highEnd: number;
  };
  availableSpaceBands: VocalSpaceBand[];
  suggestedVocalRange: {
    minHz: number;
    maxHz: number;
  };
  compressionAdjustment: VocalContextAdjustment;
  presenceAdjustment: VocalContextAdjustment;
  delayAdjustment: VocalContextAdjustment;
  hookLiftAdjustment: VocalContextAdjustment;
  adLibAdjustment: VocalContextAdjustment;
  saturationAdjustment: VocalContextAdjustment;
  verdict: string;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  skipReason?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function weightedDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  const weighted = arrangement.sections.reduce((sum, section) => sum + section.density * section.energy, 0);
  return clamp(weighted / arrangement.sections.length, 0, 1);
}

function densityClassFor(score: number): ArrangementDensityClass {
  if (score < 0.35) return 'sparse';
  if (score < 0.55) return 'moderate';
  if (score < 0.75) return 'dense';
  return 'wall_of_sound';
}

function sumTopEndLift(presenceAir: PresenceAirAnalysis): number {
  return (
    presenceAir.presenceTargets.reduce((sum, target) => sum + target.gainDb, 0) +
    presenceAir.airTargets.reduce((sum, target) => sum + target.gainDb, 0)
  );
}

function buildBand(startHz: number, endHz: number, confidence: number, rationale: string): VocalSpaceBand {
  return {
    startHz,
    endHz,
    confidence: clamp(confidence, 0, 1),
    rationale,
  };
}

function suggestedVocalRange(profile: VocalProfile, densityClass: ArrangementDensityClass): { minHz: number; maxHz: number } {
  const base = (() => {
    switch (profile.voiceType) {
      case 'bass':
        return { minHz: 80, maxHz: 180 };
      case 'baritone':
        return { minHz: 100, maxHz: 220 };
      case 'tenor':
        return { minHz: 120, maxHz: 300 };
      case 'alto':
        return { minHz: 160, maxHz: 420 };
      case 'soprano':
        return { minHz: 220, maxHz: 560 };
      default:
        return { minHz: 120, maxHz: 340 };
    }
  })();

  const spread = densityClass === 'sparse'
    ? 1.12
    : densityClass === 'moderate'
      ? 1
      : densityClass === 'dense'
        ? 0.93
        : 0.88;

  const center = (base.minHz + base.maxHz) / 2;
  const halfRange = ((base.maxHz - base.minHz) / 2) * spread;
  return {
    minHz: Math.round(Math.max(60, center - halfRange)),
    maxHz: Math.round(Math.min(800, center + halfRange)),
  };
}

function buildAdjustment(
  direction: ContextAdjustmentDirection,
  amount: number,
  rationale: string
): VocalContextAdjustment {
  return { direction, amount: clamp(amount, 0, 1), rationale };
}

export class VocalContextAwareness {
  public static analyze(
    profile: VocalProfile,
    compression: CompressionStackAnalysis,
    presenceAir: PresenceAirAnalysis,
    delay: DelayAutomationAnalysis,
    arrangement?: ArrangementAnalysis,
    intent?: VocalIntentAnalysis,
    hookLift?: HookLiftAnalysis,
    adLibPlacement?: AdLibPlacementAnalysis
  ): VocalContextAwarenessAnalysis {
    const densityScore = weightedDensity(arrangement);
    const densityClass = densityClassFor(densityScore);
    const topEndLift = sumTopEndLift(presenceAir);
    const hookSectionDensity = arrangement?.sections.find((section) => section.name.toLowerCase().includes('chorus') || section.name.toLowerCase().includes('hook'))?.density ?? densityScore;
    const verseSectionDensity = arrangement?.sections.find((section) => section.name.toLowerCase().includes('verse'))?.density ?? densityScore;
    const densityGap = clamp(hookSectionDensity - verseSectionDensity, 0, 1);

    const lowEnd = clamp(
      densityScore * 0.42 +
      (densityClass === 'wall_of_sound' ? 0.18 : densityClass === 'dense' ? 0.12 : 0.06) +
      (profile.warmth > 0.55 ? 0.08 : 0),
      0,
      1
    );
    const midRange = clamp(
      densityScore * 0.56 +
      profile.nasality * 0.14 +
      (profile.transientSharpness < 0.45 ? 0.06 : 0) +
      (compression.strategy === 'two_stage' ? 0.04 : 0),
      0,
      1
    );
    const highEnd = clamp(
      densityScore * 0.32 +
      topEndLift / 8 +
      (delay.shouldApply ? 0.04 : 0) +
      (presenceAir.warnings.length > 0 ? 0.05 : 0),
      0,
      1
    );

    const availableSpaceBands = [
      buildBand(
        2400,
        4200,
        clamp(1 - midRange * 0.7, 0.18, 0.92),
        densityClass === 'dense' || densityClass === 'wall_of_sound'
          ? 'Use the midrange pocket carefully; this band is more crowded in denser arrangements.'
          : 'The vocal can usually live here with modest presence shaping.'
      ),
      buildBand(
        5200,
        7600,
        clamp(1 - highEnd * 0.65, 0.18, 0.88),
        densityClass === 'sparse'
          ? 'A cleaner upper presence lane is available because the arrangement leaves air above the vocal.'
          : 'This band can still work, but it should be treated as polish rather than rescue.'
      ),
      buildBand(
        9000,
        13200,
        clamp(1 - highEnd * 0.58, 0.12, 0.8),
        densityClass === 'sparse'
          ? 'Air can be used more openly here because the arrangement is not already crowded at the top.'
          : 'Use this band conservatively so the vocal stays smooth instead of brittle.'
      ),
    ].sort((a, b) => b.confidence - a.confidence);

    const compressionAdjustment = buildAdjustment(
      densityClass === 'dense' || densityClass === 'wall_of_sound' ? 'tighten' : densityClass === 'sparse' ? 'loosen' : 'keep_as_is',
      densityClass === 'wall_of_sound' ? 0.28 : densityClass === 'dense' ? 0.18 : densityClass === 'sparse' ? 0.1 : 0.04,
      densityClass === 'dense' || densityClass === 'wall_of_sound'
        ? 'Dense arrangements need compression that stays controlled and focused.'
        : densityClass === 'sparse'
          ? 'Sparse arrangements can tolerate a looser, more open compression feel.'
          : 'The current compression behavior is close enough to leave mostly as-is.'
    );

    const presenceAdjustment = buildAdjustment(
      densityClass === 'dense' || densityClass === 'wall_of_sound' ? 'increase' : densityClass === 'sparse' ? 'reduce' : 'keep_as_is',
      densityClass === 'wall_of_sound' ? 0.24 : densityClass === 'dense' ? 0.16 : densityClass === 'sparse' ? 0.08 : 0.04,
      densityClass === 'dense' || densityClass === 'wall_of_sound'
        ? 'Crowded arrangements usually need more vocal presence to keep the lyric readable.'
        : densityClass === 'sparse'
          ? 'An open arrangement often needs less presence so the vocal stays natural.'
          : 'Presence can stay near its current level.'
    );

    const delayAdjustment = buildAdjustment(
      densityClass === 'dense' || densityClass === 'wall_of_sound' ? 'reduce' : densityClass === 'sparse' ? 'increase' : 'keep_as_is',
      densityClass === 'wall_of_sound' ? 0.22 : densityClass === 'dense' ? 0.14 : densityClass === 'sparse' ? 0.08 : 0.04,
      densityClass === 'dense' || densityClass === 'wall_of_sound'
        ? 'Delay throws should be sparser in dense arrangements to avoid clutter.'
        : densityClass === 'sparse'
          ? 'Sparse arrangements can carry a little more delay motion without losing clarity.'
          : 'Delay density can stay moderate.'
    );

    const hookLiftAdjustment = buildAdjustment(
      densityClass === 'dense' || densityClass === 'wall_of_sound' ? 'increase' : densityClass === 'sparse' ? 'reduce' : 'keep_as_is',
      densityClass === 'wall_of_sound' ? 0.2 : densityClass === 'dense' ? 0.12 : densityClass === 'sparse' ? 0.06 : 0.03,
      densityClass === 'dense' || densityClass === 'wall_of_sound'
        ? 'The hook needs a more deliberate contrast step when the arrangement is full.'
        : densityClass === 'sparse'
          ? 'The hook can stay a little more relaxed when the arrangement already leaves space.'
          : 'Hook contrast is close to where it should be.'
    );

    const adLibAdjustment = buildAdjustment(
      densityClass === 'dense' || densityClass === 'wall_of_sound' ? 'deepen' : densityClass === 'sparse' ? 'bring_forward' : 'keep_as_is',
      densityClass === 'wall_of_sound' ? 0.2 : densityClass === 'dense' ? 0.14 : densityClass === 'sparse' ? 0.08 : 0.03,
      densityClass === 'dense' || densityClass === 'wall_of_sound'
        ? 'Support vocals should stay deeper and narrower so they do not compete with the lead.'
        : densityClass === 'sparse'
          ? 'Support vocals can come a little forward because the arrangement leaves them room.'
          : 'Ad-lib placement can stay close to the current balance.'
    );

    const saturationAdjustment = buildAdjustment(
      densityClass === 'dense' || densityClass === 'wall_of_sound' ? 'reduce' : densityClass === 'sparse' ? 'increase' : 'keep_as_is',
      densityClass === 'wall_of_sound' ? 0.14 : densityClass === 'dense' ? 0.08 : densityClass === 'sparse' ? 0.05 : 0.03,
      densityClass === 'dense' || densityClass === 'wall_of_sound'
        ? 'Dense arrangements usually need the vocal to stay cleaner so harmonic color does not blur the pocket.'
        : densityClass === 'sparse'
          ? 'Sparse arrangements can handle a little more color without losing clarity.'
          : 'Saturation can stay close to current settings.'
    );

    const shouldApply = densityClass !== 'moderate' || topEndLift > 2.4 || densityGap > 0.14;
    const overallConfidence = clamp(
      0.58 +
      densityScore * 0.18 +
      profile.voiceTypeConfidence * 0.08 +
      (intent ? intent.confidence * 0.06 : 0.03),
      0,
      1
    );

    const riskNotes = [
      densityClass === 'wall_of_sound'
        ? 'Very dense arrangements can hide the lyric if compression, presence, and delay all expand at once.'
        : densityClass === 'dense'
          ? 'Dense arrangements need restrained support layers so the lead keeps priority.'
          : 'Keep context-aware adjustments proportional, not absolute.',
      presenceAir.warnings.length > 0
        ? 'Presence/air is already delicate, so contextual boosts should stay broad and incremental.'
        : 'The upper band is not already fragile, but it still should not be over-stacked.',
      delay.shouldApply && delay.primaryRecommendation?.useCase === 'hook_excitement'
        ? 'Delay is already doing lift work; context should not duplicate the same effect in the same phrase.'
        : 'Sparse sections can tolerate a little more movement if the vocal needs it.',
    ];

    const interactionNotes = [
      `Density score ${densityScore.toFixed(2)} maps to ${densityClass}; the vocal should shift accordingly.`,
      `Masking estimate low=${lowEnd.toFixed(2)}, mid=${midRange.toFixed(2)}, high=${highEnd.toFixed(2)}.`,
      hookLift
        ? `Hook lift amount ${hookLift.amountOfLift.toFixed(2)} and ad-lib role ${(adLibPlacement?.primaryRecommendation?.role ?? 'n/a') as string} were treated as downstream context inputs.`
        : 'Hook lift has not yet been used downstream.',
    ];

    return {
      shouldApply,
      overallConfidence,
      densityScore,
      densityClass,
      frequencyMasking: {
        lowEnd,
        midRange,
        highEnd,
      },
      availableSpaceBands,
      suggestedVocalRange: suggestedVocalRange(profile, densityClass),
      compressionAdjustment,
      presenceAdjustment,
      delayAdjustment,
      hookLiftAdjustment,
      adLibAdjustment,
      saturationAdjustment,
      verdict: densityClass === 'wall_of_sound'
        ? 'The arrangement is very dense and needs the vocal to stay focused.'
        : densityClass === 'dense'
          ? 'The arrangement is dense and benefits from tighter, more intentional vocal placement.'
          : densityClass === 'sparse'
            ? 'The arrangement leaves room for a more open vocal.'
            : 'The arrangement is balanced enough for modest contextual shaping.',
      rationale: [
        `Arrangement density classified as ${densityClass} from section density and energy flow.`,
        'This analysis translates song context into machine-usable adjustment hints for the vocal chain.',
      ].join(' '),
      riskNotes,
      interactionNotes,
    };
  }
}

export const vocalContextAwareness = VocalContextAwareness;
