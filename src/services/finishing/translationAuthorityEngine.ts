import type { PerceptualConsequenceAnalysis } from './perceptualConsequenceEngine';
import type { ReferenceDeltaAnalysis } from './referenceDeltaEngine';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import { clamp, mean } from '../lowend/lowEndUtils';

export type TranslationAuthorityVerdict = 'pass' | 'borderline' | 'fail';
export type TranslationAuthorityDevice = 'mono' | 'phone' | 'car' | 'airpods';

export interface TranslationAuthorityTarget {
  device: TranslationAuthorityDevice;
  score: number;
  verdict: TranslationAuthorityVerdict;
  blocker: string;
  recommendation: string;
}

export interface TranslationAuthorityAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  verdict: TranslationAuthorityVerdict;
  finishScore: number;
  targets: TranslationAuthorityTarget[];
  blockers: string[];
  recommendations: string[];
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  hardStop: string;
}

export interface TranslationAuthorityInput {
  phaseCMastering?: PhaseCMasteringAnalysis;
  lowEnd?: LowEndDisciplineAnalysis;
  referenceDelta?: ReferenceDeltaAnalysis;
  perceptualConsequence?: PerceptualConsequenceAnalysis;
}

const DEVICES: TranslationAuthorityDevice[] = ['mono', 'phone', 'car', 'airpods'];

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

function targetVerdict(score: number): TranslationAuthorityVerdict {
  if (score >= 0.75) return 'pass';
  if (score >= 0.58) return 'borderline';
  return 'fail';
}

function consequenceScoreForDevice(
  consequence: PerceptualConsequenceAnalysis | undefined,
  device: TranslationAuthorityDevice
): number {
  if (!consequence) return 0.5;
  const target = consequence.targets.find((entry) => entry.system === device);
  if (!target) return 0.5;

  const severityPenalty: Record<'low' | 'moderate' | 'high' | 'critical', number> = {
    low: 0.05,
    moderate: 0.14,
    high: 0.28,
    critical: 0.42,
  };

  return clamp(1 - severityPenalty[target.severity], 0, 1);
}

function blockerFromTarget(device: TranslationAuthorityDevice, score: number): string {
  if (score >= 0.75) return '';
  if (device === 'mono') return 'Mono collapse risk remains too high.';
  if (device === 'phone') return 'Small-speaker intelligibility is not stable enough.';
  if (device === 'car') return 'The low-end pocket is still too loose for car playback.';
  return 'Earbud playback may still expose harsh top-end or clutter.';
}

function recommendationFromTarget(device: TranslationAuthorityDevice, score: number): string {
  if (score >= 0.75) return 'Translation is stable enough to lock.';
  if (device === 'mono') return 'Re-center low-end width before final lock.';
  if (device === 'phone') return 'Tighten vocal and midrange clarity before release.';
  if (device === 'car') return 'Re-check bass/kick balance and the drum pocket.';
  return 'Smooth the top end and reduce support-layer clutter.';
}

export class TranslationAuthorityEngine {
  public static analyze(input: TranslationAuthorityInput): TranslationAuthorityAnalysis {
    const phaseTargets = input.phaseCMastering?.finalTranslation.targets ?? [];
    const lowEndTargets = input.lowEnd?.translationValidation.targets ?? [];

    const targets = DEVICES.map((device) => {
      const phaseTarget = phaseTargets.find((entry) => entry.device === device);
      const lowEndTarget = lowEndTargets.find((entry) => entry.device === device);
      const referenceDeltaPenalty = input.referenceDelta
        ? clamp(Math.abs(input.referenceDelta.loudness.delta) / 8 + Math.abs(input.referenceDelta.dynamics.delta) / 6, 0, 0.25)
        : 0;
      const consequenceScore = consequenceScoreForDevice(input.perceptualConsequence, device);

      const baseScore = phaseTarget?.score ?? lowEndTarget?.score ?? 0.62;
      const lowEndScore = lowEndTarget?.score ?? (input.lowEnd ? 0.62 : 0.72);
      const phaseScore = phaseTarget?.score ?? (input.phaseCMastering ? 0.68 : 0.72);

      const score = clamp(
        baseScore * 0.58 +
        lowEndScore * 0.16 +
        phaseScore * 0.14 +
        consequenceScore * 0.08 +
        (input.referenceDelta ? clamp(input.referenceDelta.matchScore / 100, 0, 1) * 0.08 : 0.04) -
        referenceDeltaPenalty,
        0,
        1
      );

      const verdict = targetVerdict(score);
      const blocker = verdict === 'fail' ? blockerFromTarget(device, score) : '';

      return {
        device,
        score,
        verdict,
        blocker,
        recommendation: recommendationFromTarget(device, score),
      } satisfies TranslationAuthorityTarget;
    });

    const scores = targets.map((target) => target.score);
    const overallScore = mean(scores);
    const hardStops = targets.filter((target) => target.verdict === 'fail').map((target) => target.blocker);
    const warnings = targets.filter((target) => target.verdict !== 'pass').map((target) => target.recommendation);
    const verdict: TranslationAuthorityVerdict = hardStops.length > 0
      ? 'fail'
      : targets.some((target) => target.verdict === 'borderline')
        ? 'borderline'
        : 'pass';

    const shouldApply = verdict !== 'pass';
    const blockers = Array.from(new Set([
      ...(input.lowEnd?.verdict === 'needs_translation' ? ['Low-end translation is still unstable.'] : []),
      ...(input.phaseCMastering?.finalTranslation.verdict === 'needs_translation_work' ? ['Phase C translation needs another pass.'] : []),
      ...(input.referenceDelta && input.referenceDelta.matchScore < 72 ? ['Reference delta is still too far from the target world.'] : []),
      ...hardStops,
    ]));

    const recommendations = Array.from(new Set([
      ...warnings,
      ...(input.phaseCMastering?.finalTranslation.rationale ? [input.phaseCMastering.finalTranslation.rationale] : []),
      ...(input.lowEnd ? [input.lowEnd.translationValidation.rationale] : []),
      ...(input.referenceDelta?.recommendations ?? []).slice(0, 2),
    ]));

    const rationale = verdict === 'pass'
      ? 'The record is translating cleanly enough to lock.'
      : verdict === 'borderline'
        ? 'The master is close, but one or more playback systems still need a targeted pass.'
        : 'The record is not release-safe yet because at least one playback system remains below the comfort line.';

    const riskNotes = Array.from(new Set([
      ...(input.lowEnd?.riskNotes ?? []).slice(0, 2),
      ...(input.phaseCMastering?.riskNotes ?? []).slice(0, 2),
      ...(input.perceptualConsequence?.riskNotes ?? []).slice(0, 2),
      ...(input.referenceDelta?.riskNotes ?? []).slice(0, 2),
    ]));

    const interactionNotes = Array.from(new Set([
      ...(input.lowEnd?.interactionNotes ?? []).slice(0, 2),
      ...(input.phaseCMastering?.interactionNotes ?? []).slice(0, 2),
      ...(input.perceptualConsequence?.interactionNotes ?? []).slice(0, 2),
      ...(input.referenceDelta?.interactionNotes ?? []).slice(0, 2),
    ]));

    const analysisFingerprint = fnv1aHex(stableSerialize({
      verdict,
      overallScore,
      targets: targets.map((target) => ({
        device: target.device,
        verdict: target.verdict,
        score: target.score,
      })),
      lowEnd: input.lowEnd?.translationValidation.verdict,
      phaseC: input.phaseCMastering?.finalTranslation.verdict,
      reference: input.referenceDelta?.matchScore,
    }));

    return {
      shouldApply,
      analysisFingerprint,
      verdict,
      finishScore: Math.round(overallScore * 10 * 10) / 10,
      targets,
      blockers,
      recommendations,
      rationale,
      riskNotes,
      interactionNotes,
      hardStop: verdict === 'fail'
        ? 'Do not lock the master. Resolve the listed blockers first.'
        : verdict === 'borderline'
          ? 'Review carefully before locking. One more targeted pass may be enough.'
          : 'Safe to lock this translation profile.',
    };
  }
}

export const analyzeTranslationAuthority = TranslationAuthorityEngine.analyze.bind(TranslationAuthorityEngine);
