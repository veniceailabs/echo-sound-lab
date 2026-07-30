import type { AlbumAuthorityAnalysis } from './albumAuthorityEngine';
import type { PerceptualConsequenceAnalysis } from './perceptualConsequenceEngine';
import type { ReferenceDeltaAnalysis } from './referenceDeltaEngine';
import type { SessionNarrativeAnalysis } from './sessionNarrativeEngine';
import type { SessionFinishAuthorityAnalysis } from './sessionFinishAuthority';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import { clamp, mean } from '../lowend/lowEndUtils';
import {
  analyzeTranslationAuthority,
  type TranslationAuthorityAnalysis,
} from './translationAuthorityEngine';

export type FinishLoopVerdict = 'PASS' | 'BORDERLINE' | 'FAIL';
export type FinishLoopStepType = 'measure' | 'apply' | 'recheck' | 'compare' | 'lock';

export interface FinishLoopStep {
  step: FinishLoopStepType;
  detail: string;
}

export interface FinishLoopAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  finishScore: number;
  verdict: FinishLoopVerdict;
  translationAuthority: TranslationAuthorityAnalysis;
  iterationsSuggested: number;
  blockers: string[];
  recommendations: string[];
  loopPlan: FinishLoopStep[];
  summary: string;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

export interface FinishLoopInput {
  sessionNarrative?: SessionNarrativeAnalysis;
  consequence?: PerceptualConsequenceAnalysis;
  album?: AlbumAuthorityAnalysis;
  referenceDelta?: ReferenceDeltaAnalysis;
  phaseCMastering?: PhaseCMasteringAnalysis;
  lowEnd?: LowEndDisciplineAnalysis;
  vocalIntent?: VocalIntentAnalysis;
  sessionFinish?: SessionFinishAuthorityAnalysis;
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

function averageConfidence(input: FinishLoopInput): number {
  const values = [
    input.sessionNarrative?.continuity.energy ?? 0.5,
    input.consequence?.overallConfidence ?? 0.5,
    input.album?.consistencyScore ? input.album.consistencyScore / 100 : 0.5,
    input.referenceDelta?.matchScore ? input.referenceDelta.matchScore / 100 : 0.5,
    input.phaseCMastering?.overallConfidence ?? 0.5,
    input.lowEnd?.overallConfidence ?? 0.5,
    input.vocalIntent?.confidence ?? 0.5,
    input.sessionFinish?.authorityScore ? input.sessionFinish.authorityScore / 100 : 0.5,
  ];
  return mean(values);
}

function buildBlockers(input: FinishLoopInput, translation: TranslationAuthorityAnalysis): string[] {
  const blockers = [
    ...(translation.blockers ?? []),
    ...(input.lowEnd?.verdict === 'needs_translation' ? ['Low-end translation is still unstable.'] : []),
    ...(input.phaseCMastering?.finalTranslation.verdict === 'needs_translation_work' ? ['Phase C translation needs another pass.'] : []),
    ...(input.referenceDelta && input.referenceDelta.matchScore < 72 ? ['Reference delta is still too far from the target world.'] : []),
    ...(input.album?.shouldApply && input.album.consistencyScore < 78 ? ['Album cohesion is not tight enough to lock.'] : []),
    ...(input.consequence?.targets.some((target) => target.severity === 'high' || target.severity === 'critical')
      ? ['At least one playback system still carries a high-risk consequence.']
      : []),
    ...(input.sessionFinish?.verdict && input.sessionFinish.verdict !== 'ready'
      ? ['Session finish authority is not fully locked.']
      : []),
  ];
  return Array.from(new Set(blockers));
}

function buildRecommendations(input: FinishLoopInput, translation: TranslationAuthorityAnalysis): string[] {
  return Array.from(new Set([
    ...(translation.recommendations ?? []),
    ...(input.sessionNarrative?.rationale ? [input.sessionNarrative.rationale] : []),
    ...(input.consequence?.summary ? [input.consequence.summary] : []),
    ...(input.album?.recommendations ?? []).slice(0, 2),
    ...(input.referenceDelta?.recommendations ?? []).slice(0, 2),
  ]));
}

function loopPlanForVerdict(verdict: FinishLoopVerdict, iterationsSuggested: number): FinishLoopStep[] {
  const base: FinishLoopStep[] = [
    { step: 'measure', detail: 'Measure the current finish state against the release gate.' },
    { step: 'apply', detail: verdict === 'PASS' ? 'No further destructive moves are required.' : 'Apply only the smallest targeted correction that addresses the highest blocker.' },
    { step: 'recheck', detail: 'Re-run translation authority after the correction.' },
    { step: 'compare', detail: 'Compare the new state against the previous lock threshold.' },
    { step: 'lock', detail: verdict === 'PASS'
      ? 'Lock the master and freeze the release state.'
      : `Hold the lock until ${iterationsSuggested} more iteration(s) clear the blockers.` },
  ];
  return base;
}

export class FinishLoopEngine {
  public static analyze(input: FinishLoopInput): FinishLoopAnalysis {
    const translationAuthority = analyzeTranslationAuthority({
      phaseCMastering: input.phaseCMastering,
      lowEnd: input.lowEnd,
      referenceDelta: input.referenceDelta,
      perceptualConsequence: input.consequence,
    });

    const confidence = averageConfidence(input);
    const componentScores = [
      translationAuthority.finishScore / 10,
      input.phaseCMastering?.overallConfidence ?? 0.5,
      input.sessionFinish?.authorityScore ? input.sessionFinish.authorityScore / 100 : 0.5,
      input.album?.consistencyScore ? input.album.consistencyScore / 100 : 0.5,
      input.referenceDelta?.matchScore ? input.referenceDelta.matchScore / 100 : 0.5,
      input.consequence?.overallConfidence ?? 0.5,
      input.lowEnd?.overallConfidence ?? 0.5,
      input.sessionNarrative
        ? mean([
            input.sessionNarrative.continuity.energy,
            input.sessionNarrative.continuity.tonal,
            input.sessionNarrative.continuity.pacing,
          ])
        : 0.5,
    ];

    const blockerList = buildBlockers(input, translationAuthority);
    const blockerPenalty = Math.min(2.2, blockerList.length * 0.28);
    const finishScore = clamp(mean(componentScores) * 10 - blockerPenalty, 0, 10);

    let verdict: FinishLoopVerdict = 'FAIL';
    if (finishScore >= 8.6 && translationAuthority.verdict === 'pass' && blockerList.length === 0) {
      verdict = 'PASS';
    } else if (finishScore >= 6.8 && translationAuthority.verdict !== 'fail') {
      verdict = 'BORDERLINE';
    }

    const shouldApply = verdict !== 'PASS';
    const iterationsSuggested = verdict === 'PASS'
      ? 0
      : verdict === 'BORDERLINE'
        ? 1
        : Math.max(2, Math.ceil((8.6 - finishScore) / 0.9));

    const recommendations = buildRecommendations(input, translationAuthority);
    if (verdict === 'FAIL') {
      recommendations.unshift('Do not lock the master yet. Fix the hard blockers first.');
    } else if (verdict === 'BORDERLINE') {
      recommendations.unshift('The record is close, but one more targeted pass is still justified.');
    } else {
      recommendations.unshift('The finish loop converged. Lock the result and move to delivery.');
    }

    const riskNotes = Array.from(new Set([
      ...(input.phaseCMastering?.riskNotes ?? []).slice(0, 2),
      ...(input.lowEnd?.riskNotes ?? []).slice(0, 2),
      ...(input.referenceDelta?.riskNotes ?? []).slice(0, 2),
      ...(input.consequence?.riskNotes ?? []).slice(0, 2),
      ...(translationAuthority.riskNotes ?? []).slice(0, 2),
    ]));

    const interactionNotes = Array.from(new Set([
      ...(input.phaseCMastering?.interactionNotes ?? []).slice(0, 2),
      ...(input.lowEnd?.interactionNotes ?? []).slice(0, 2),
      ...(input.referenceDelta?.interactionNotes ?? []).slice(0, 2),
      ...(input.consequence?.interactionNotes ?? []).slice(0, 2),
      ...(translationAuthority.interactionNotes ?? []).slice(0, 2),
    ]));

    const analysisFingerprint = fnv1aHex(stableSerialize({
      verdict,
      finishScore,
      translation: translationAuthority.analysisFingerprint,
      blockers: blockerList,
      recommendations: recommendations.slice(0, 4),
      confidence,
    }));

    const summary = verdict === 'PASS'
      ? 'The finish loop converged and the record is ready to lock.'
      : verdict === 'BORDERLINE'
        ? 'The finish loop is close, but one or two targeted passes still remain.'
        : 'The finish loop has not converged because one or more blockers still exceed the release gate.';

    const rationale = verdict === 'PASS'
      ? 'The combined finish, translation, and reference signals are coherent enough to trust.'
      : 'The combined finish signals still disagree enough that another targeted iteration is justified.';

    return {
      shouldApply,
      analysisFingerprint,
      finishScore: Math.round(finishScore * 10) / 10,
      verdict,
      translationAuthority,
      iterationsSuggested,
      blockers: blockerList,
      recommendations,
      loopPlan: loopPlanForVerdict(verdict, iterationsSuggested),
      summary,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzeFinishLoop = FinishLoopEngine.analyze.bind(FinishLoopEngine);
