import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalContextAwarenessAnalysis } from '../vocal/contextAwareness';
import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';
import { clamp, mean } from './lowEndUtils';
import { KickBassControl, type KickBassControlAnalysis } from './kickBassControl';
import { Note808Consistency, type Note808ConsistencyAnalysis } from './note808Consistency';
import { StereoLowMono, type StereoLowMonoAnalysis } from './stereoLowMono';
import { DrumPocketLogic, type DrumPocketAnalysis } from './drumPocketLogic';
import { TranslationValidator, type TranslationValidationAnalysis } from './translationValidator';

export interface LowEndDisciplineAnalysis {
  shouldApply: boolean;
  analysisFingerprint?: string;
  overallConfidence: number;
  kickBassControl: KickBassControlAnalysis;
  note808Consistency: Note808ConsistencyAnalysis;
  stereoLowMono: StereoLowMonoAnalysis;
  drumPocket: DrumPocketAnalysis;
  translationValidation: TranslationValidationAnalysis;
  verdict: 'stable' | 'needs_shaping' | 'needs_translation' | 'tight';
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function densityBias(context?: VocalContextAwarenessAnalysis): number {
  if (!context) return 0;
  switch (context.densityClass) {
    case 'wall_of_sound':
      return 0.12;
    case 'dense':
      return 0.08;
    case 'moderate':
      return 0.04;
    default:
      return 0;
  }
}

export class LowEndDiscipline {
  public static analyze(
    buffer: VocalIntakeBufferLike,
    arrangement?: ArrangementAnalysis,
    context?: VocalContextAwarenessAnalysis
  ): LowEndDisciplineAnalysis {
    const kickBassControl = KickBassControl.analyze(buffer, arrangement);
    const note808Consistency = Note808Consistency.analyze(buffer, arrangement);
    const stereoLowMono = StereoLowMono.analyze(buffer, arrangement);
    const drumPocket = DrumPocketLogic.analyze(buffer, arrangement);
    const translationValidation = TranslationValidator.analyze(
      buffer,
      arrangement,
      kickBassControl,
      note808Consistency,
      stereoLowMono,
      drumPocket
    );

    const overallConfidence = clamp(
      mean([
        kickBassControl.overallConfidence,
        note808Consistency.overallConfidence,
        stereoLowMono.overallConfidence,
        drumPocket.overallConfidence,
        translationValidation.overallConfidence,
      ]) - densityBias(context),
      0,
      1
    );

    const shouldApply =
      kickBassControl.shouldApply ||
      note808Consistency.shouldApply ||
      stereoLowMono.shouldApply ||
      drumPocket.shouldApply ||
      translationValidation.shouldApply;

    const isSparseContext = context?.densityClass === 'sparse';
    const isAlreadyTranslating = translationValidation.verdict === 'translation_ready';
    const advisoryOnly = isAlreadyTranslating && (
      isSparseContext ||
      (!shouldApply && context?.densityClass !== 'dense') ||
      overallConfidence < 0.8
    );

    const verdict: LowEndDisciplineAnalysis['verdict'] = translationValidation.verdict === 'needs_translation_work'
      ? 'needs_translation'
      : advisoryOnly
        ? (context?.densityClass === 'dense' && !shouldApply ? 'tight' : 'stable')
        : shouldApply
          ? 'needs_shaping'
          : 'tight';

    const rationale = verdict === 'needs_shaping'
      ? 'The low end is functional, but it still needs shaping to lock the kick, bass, pocket, and translation together.'
      : verdict === 'needs_translation'
        ? 'The low end still needs translation work before it can be trusted across playback systems.'
        : 'The low end is stable enough to trust across the current mix context, with only advisory shaping left.';

    const riskNotes = Array.from(new Set([
      ...kickBassControl.riskNotes,
      ...note808Consistency.riskNotes,
      ...stereoLowMono.riskNotes,
      ...drumPocket.riskNotes,
      ...translationValidation.riskNotes,
    ]));

    const interactionNotes = Array.from(new Set([
      ...kickBassControl.interactionNotes,
      ...note808Consistency.interactionNotes,
      ...stereoLowMono.interactionNotes,
      ...drumPocket.interactionNotes,
      ...translationValidation.interactionNotes,
    ]));

    return {
      shouldApply,
      overallConfidence,
      kickBassControl,
      note808Consistency,
      stereoLowMono,
      drumPocket,
      translationValidation,
      verdict,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzeLowEndDiscipline = LowEndDiscipline.analyze.bind(LowEndDiscipline);
