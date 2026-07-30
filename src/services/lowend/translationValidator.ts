import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';
import { clamp, mean } from './lowEndUtils';
import type { KickBassControlAnalysis } from './kickBassControl';
import type { Note808ConsistencyAnalysis } from './note808Consistency';
import type { StereoLowMonoAnalysis } from './stereoLowMono';
import type { DrumPocketAnalysis } from './drumPocketLogic';

export type TranslationTarget = 'mono' | 'phone' | 'car' | 'airpods';

export interface TranslationTargetAssessment {
  device: TranslationTarget;
  score: number;
  risk: string;
  recommendation: string;
}

export interface TranslationValidationAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  targets: TranslationTargetAssessment[];
  verdict: 'translation_ready' | 'needs_translation_work' | 'mixed';
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

function buildTargetAssessments(
  kickBass: KickBassControlAnalysis,
  note808: Note808ConsistencyAnalysis,
  stereoLowMono: StereoLowMonoAnalysis,
  drumPocket: DrumPocketAnalysis
): TranslationTargetAssessment[] {
  const monoScore = clamp((stereoLowMono.monoBelow120Score * 0.78) + ((stereoLowMono.lowBandCorrelation + 1) / 2) * 0.22, 0, 1);
  const phoneScore = clamp(
    drumPocket.pocketScore * 0.36 +
    note808.stabilityScore * 0.24 +
    (1 - kickBass.maskingScore) * 0.18 +
    stereoLowMono.monoBelow120Score * 0.22,
    0,
    1
  );
  const carScore = clamp(
    stereoLowMono.monoBelow120Score * 0.36 +
    drumPocket.pocketScore * 0.36 +
    note808.stabilityScore * 0.28,
    0,
    1
  );
  const airpodsScore = clamp(
    stereoLowMono.monoBelow120Score * 0.34 +
    (1 - kickBass.maskingScore) * 0.28 +
    drumPocket.pocketScore * 0.38,
    0,
    1
  );

  return [
    {
      device: 'mono',
      score: monoScore,
      risk: monoScore < 0.68 ? 'Low-band phase spread will change the balance in mono.' : 'Mono-compatible low end is in decent shape.',
      recommendation: monoScore < 0.68
        ? 'Collapse the low end below the crossover and revisit stereo width above it.'
        : 'Mono playback should hold the low-end image together.',
    },
    {
      device: 'phone',
      score: phoneScore,
      risk: phoneScore < 0.68 ? 'The low end may read as too sub-heavy on small speakers.' : 'Small-speaker translation is stable enough to trust.',
      recommendation: phoneScore < 0.68
        ? 'Trim sub emphasis and preserve a little more mid-bass definition.'
        : 'Phone translation should keep the groove audible.',
    },
    {
      device: 'car',
      score: carScore,
      risk: carScore < 0.68 ? 'Kick and bass may not feel anchored in a car cabin.' : 'Car playback should keep the low-end pocket intact.',
      recommendation: carScore < 0.68
        ? 'Tighten the pocket and keep the kick/bass center image more stable.'
        : 'Car playback should feel controlled and musical.',
    },
    {
      device: 'airpods',
      score: airpodsScore,
      risk: airpodsScore < 0.68 ? 'The low end may overhang the rest of the mix on earbuds.' : 'Earbud playback should stay balanced.',
      recommendation: airpodsScore < 0.68
        ? 'Reduce low-end masking and keep the pocket more focused.'
        : 'AirPods playback should stay balanced enough for casual listening.',
    },
  ];
}

export class TranslationValidator {
  public static analyze(
    _buffer: VocalIntakeBufferLike,
    arrangement: ArrangementAnalysis | undefined,
    kickBass: KickBassControlAnalysis,
    note808: Note808ConsistencyAnalysis,
    stereoLowMono: StereoLowMonoAnalysis,
    drumPocket: DrumPocketAnalysis
  ): TranslationValidationAnalysis {
    const targets = buildTargetAssessments(kickBass, note808, stereoLowMono, drumPocket);
    const targetScores = targets.map((target) => target.score);
    const arrangementDensity = averageDensity(arrangement);
    const denseTranslationRisk =
      arrangementDensity > 0.72 &&
      stereoLowMono.shouldCollapseToMono &&
      note808.shouldApply;
    const overallConfidence = clamp(
      0.42 +
      mean(targetScores) * 0.34 +
      stereoLowMono.monoBelow120Score * 0.1 +
      note808.stabilityScore * 0.08 +
      arrangementDensity * 0.06,
      0,
      1
    );
    const lowestTarget = targets.reduce((lowest, target) => (target.score < lowest.score ? target : lowest), targets[0]);
    const shouldApply = lowestTarget.score < 0.24 || mean(targetScores) < 0.32;

    let verdict: TranslationValidationAnalysis['verdict'] = 'mixed';
    if (targetScores.every((score) => score >= 0.4) && !denseTranslationRisk) verdict = 'translation_ready';
    else if (targetScores.some((score) => score < 0.25) || denseTranslationRisk) verdict = 'needs_translation_work';

    const rationale = shouldApply
      ? 'The low-end is close, but at least one playback target still needs cleanup for consistent translation.'
      : 'The low end is translating consistently across mono, phone, car, and earbuds.';

    const riskNotes = targets
      .filter((target) => target.score < 0.24)
      .map((target) => `${target.device} needs more low-end discipline.`)
      .slice(0, 3);

    const interactionNotes: string[] = [];
    if (kickBass.maskingScore > 0.4) interactionNotes.push('Low-end masking is still strong enough to affect several playback environments.');
    if (note808.stabilityScore < 0.7) interactionNotes.push('808 stability is a major factor in the current translation score.');
    if (stereoLowMono.shouldCollapseToMono) interactionNotes.push('Mono-collapsing the sub range should improve consistency across devices.');
    if (drumPocket.pocketScore > 0.72) interactionNotes.push('The pocket itself is working; remaining issues are mostly about balance and translation.');

    return {
      shouldApply,
      overallConfidence,
      targets,
      verdict,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}
