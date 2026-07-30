import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { SpectralProfile } from '../dsp/SpectralAnalyzer';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import type { VocalProfile } from '../vocal/vocalProfiler';
import { clamp, mean } from '../lowend/lowEndUtils';
import { BusGlue, type BusGlueAnalysis } from './busGlue';
import {
  LoudnessWithoutCollapse,
  type LoudnessWithoutCollapseAnalysis,
} from './loudnessWithoutCollapse';
import { TopEndPolish, type TopEndPolishAnalysis } from './topEndPolish';
import {
  ReferenceConstrainedMastering,
  type ReferenceConstrainedMasteringAnalysis,
} from './referenceConstrainedMastering';
import {
  FinalTranslationCheck,
  type FinalTranslationCheckAnalysis,
} from './finalTranslationCheck';

export interface PhaseCMasteringAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  busGlue: BusGlueAnalysis;
  loudnessControl: LoudnessWithoutCollapseAnalysis;
  topEndPolish: TopEndPolishAnalysis;
  referenceMastering: ReferenceConstrainedMasteringAnalysis;
  finalTranslation: FinalTranslationCheckAnalysis;
  verdict: 'ready' | 'needs_glue' | 'needs_level' | 'needs_polish' | 'needs_translation' | 'needs_mastering';
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

export class PhaseCMastering {
  public static analyze(
    metrics: APLSignalMetrics,
    spectralProfile: SpectralProfile,
    arrangement?: ArrangementAnalysis,
    lowEnd?: LowEndDisciplineAnalysis,
    vocalProfile?: VocalProfile,
    vocalIntent?: VocalIntentAnalysis
  ): PhaseCMasteringAnalysis {
    const busGlue = BusGlue.analyze(metrics, arrangement, lowEnd, vocalIntent);
    const loudnessControl = LoudnessWithoutCollapse.analyze(metrics, arrangement, lowEnd, vocalIntent);
    const topEndPolish = TopEndPolish.analyze(metrics, spectralProfile, vocalProfile, busGlue, loudnessControl, vocalIntent);
    const referenceMastering = ReferenceConstrainedMastering.analyze(
      metrics,
      arrangement,
      lowEnd,
      loudnessControl,
      topEndPolish,
      vocalIntent
    );
    const finalTranslation = FinalTranslationCheck.analyze(
      metrics,
      spectralProfile,
      lowEnd || {
        shouldApply: false,
        overallConfidence: 0,
        kickBassControl: {
          shouldApply: false,
          overallConfidence: 0,
          lowBandPowerDb: -120,
          midLowPowerDb: -120,
          highPassPowerDb: -120,
          lowToMidRatio: 1,
          lowToHighRatio: 1,
          maskingScore: 0,
          pocketScore: 1,
          dominantFocus: 'shared',
          focusBands: [],
          recommendation: 'No low-end analysis was provided.',
          riskNotes: [],
          interactionNotes: [],
        },
        note808Consistency: {
          shouldApply: false,
          overallConfidence: 0,
          dominantFundamentalHz: 0,
          dominantNote: 'unknown',
          noteVarianceHz: 0,
          stabilityScore: 1,
          activeWindowRatio: 1,
          windowNotes: [],
          recommendation: 'No 808 analysis was provided.',
          riskNotes: [],
          interactionNotes: [],
        },
        stereoLowMono: {
          shouldApply: false,
          overallConfidence: 0,
          lowBandCorrelation: 1,
          lowBandBalance: 1,
          monoBelow120Score: 1,
          crossoverHz: 120,
          widthReduction: 0,
          shouldCollapseToMono: false,
          recommendation: 'No stereo low-mono analysis was provided.',
          riskNotes: [],
          interactionNotes: [],
        },
        drumPocket: {
          shouldApply: false,
          overallConfidence: 0,
          transientWeightScore: 0.5,
          pocketScore: 1,
          rhythmicConsistency: 1,
          pocketClass: 'tight',
          windows: [],
          recommendation: 'No drum pocket analysis was provided.',
          riskNotes: [],
          interactionNotes: [],
        },
        translationValidation: {
          shouldApply: false,
          overallConfidence: 1,
          targets: [
            { device: 'mono', score: 1, risk: 'No low-end analysis was provided.', recommendation: 'No adjustment needed.' },
            { device: 'phone', score: 1, risk: 'No low-end analysis was provided.', recommendation: 'No adjustment needed.' },
            { device: 'car', score: 1, risk: 'No low-end analysis was provided.', recommendation: 'No adjustment needed.' },
            { device: 'airpods', score: 1, risk: 'No low-end analysis was provided.', recommendation: 'No adjustment needed.' },
          ],
          verdict: 'translation_ready',
          rationale: 'No low-end analysis was provided.',
          riskNotes: [],
          interactionNotes: [],
        },
        verdict: 'stable',
        rationale: 'No low-end analysis was provided.',
        riskNotes: [],
        interactionNotes: [],
      },
      busGlue,
      loudnessControl,
      topEndPolish,
      referenceMastering
    );

    const parts = [busGlue, loudnessControl, topEndPolish, referenceMastering, finalTranslation];
    const overallConfidence = clamp(mean(parts.map((part) => part.overallConfidence)), 0, 1);
    const shouldApply = parts.some((part) => part.shouldApply);
    const density = averageDensity(arrangement);

    const verdict: PhaseCMasteringAnalysis['verdict'] = finalTranslation.verdict === 'needs_translation_work'
      ? 'needs_translation'
      : loudnessControl.shouldApply
        ? 'needs_level'
        : topEndPolish.shouldApply
          ? 'needs_polish'
          : busGlue.shouldApply || referenceMastering.shouldApply
            ? 'needs_glue'
            : density > 0.7 && shouldApply
              ? 'needs_mastering'
              : 'ready';

    const rationale = shouldApply
      ? 'The finishing stage still needs at least one targeted pass so the master lands cleanly across loudness, tone, and playback translation.'
      : 'The mix already sits in a release-safe finish window.';

    const riskNotes = Array.from(new Set([
      ...busGlue.riskNotes,
      ...loudnessControl.riskNotes,
      ...topEndPolish.riskNotes,
      ...referenceMastering.riskNotes,
      ...finalTranslation.riskNotes,
    ]));

    const interactionNotes = Array.from(new Set([
      ...busGlue.interactionNotes,
      ...loudnessControl.interactionNotes,
      ...topEndPolish.interactionNotes,
      ...referenceMastering.interactionNotes,
      ...finalTranslation.interactionNotes,
    ]));

    return {
      shouldApply,
      overallConfidence,
      busGlue,
      loudnessControl,
      topEndPolish,
      referenceMastering,
      finalTranslation,
      verdict,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzePhaseCMastering = PhaseCMastering.analyze.bind(PhaseCMastering);

