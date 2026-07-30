import type { AlbumAuthorityAnalysis } from './albumAuthorityEngine';
import type { PerceptualConsequenceAnalysis } from './perceptualConsequenceEngine';
import type { ReferenceDeltaAnalysis } from './referenceDeltaEngine';
import type { SessionNarrativeAnalysis } from './sessionNarrativeEngine';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import { clamp, mean } from '../lowend/lowEndUtils';

export type SessionFinishVerdict = 'ready' | 'needs_reference' | 'needs_album' | 'needs_consequence' | 'needs_attention';

export interface SessionFinishAuthorityInput {
  narrative?: SessionNarrativeAnalysis;
  consequence?: PerceptualConsequenceAnalysis;
  album?: AlbumAuthorityAnalysis;
  referenceDelta?: ReferenceDeltaAnalysis;
  phaseCMastering?: PhaseCMasteringAnalysis;
  lowEnd?: LowEndDisciplineAnalysis;
  vocalIntent?: VocalIntentAnalysis;
}

export interface SessionFinishAuthorityAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  verdict: SessionFinishVerdict;
  authorityScore: number;
  summary: string;
  priorities: string[];
  warnings: string[];
  recommendations: string[];
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

export class SessionFinishAuthority {
  public static analyze(input: SessionFinishAuthorityInput): SessionFinishAuthorityAnalysis {
    const authoritySignals = [
      input.narrative?.continuity.energy ?? 0.5,
      input.consequence?.overallConfidence ?? 0.5,
      input.album?.consistencyScore ? input.album.consistencyScore / 100 : 0.5,
      input.referenceDelta?.matchScore ? input.referenceDelta.matchScore / 100 : 0.5,
      input.phaseCMastering?.overallConfidence ?? 0.5,
      input.lowEnd?.overallConfidence ?? 0.5,
      input.vocalIntent?.confidence ?? 0.5,
    ];

    const authorityScore = Math.round(clamp(mean(authoritySignals) * 100, 0, 100));
    const shouldApply = authorityScore < 85 || !!input.referenceDelta?.shouldApply || !!input.album?.shouldApply || !!input.consequence?.shouldApply;

    let verdict: SessionFinishVerdict = 'ready';
    if (input.referenceDelta?.shouldApply) verdict = 'needs_reference';
    else if (input.album?.shouldApply) verdict = 'needs_album';
    else if (input.consequence?.shouldApply) verdict = 'needs_consequence';
    else if (shouldApply) verdict = 'needs_attention';

    const priorities: string[] = [];
    if (input.narrative?.overallArc) priorities.push(`Narrative arc: ${input.narrative.overallArc}`);
    if (input.vocalIntent?.intent) priorities.push(`Vocal intent: ${input.vocalIntent.intent}`);
    if (input.album?.currentTrackVibeMatch !== undefined) priorities.push(`Album vibe match: ${input.album.currentTrackVibeMatch}%`);
    if (input.referenceDelta?.matchScore !== undefined) priorities.push(`Reference match: ${input.referenceDelta.matchScore}%`);

    const warnings: string[] = [];
    if (input.lowEnd?.verdict && input.lowEnd.verdict !== 'stable' && input.lowEnd.verdict !== 'tight') {
      warnings.push('Low-end discipline is not fully locked.');
    }
    if (input.phaseCMastering?.verdict && input.phaseCMastering.verdict !== 'ready') {
      warnings.push('Finish-layer mastering still has a targeted pass to make.');
    }
    if (input.consequence?.targets.some((target) => target.severity === 'high' || target.severity === 'critical')) {
      warnings.push('At least one playback system still carries a high-risk consequence.');
    }

    const recommendations: string[] = [];
    if (input.referenceDelta?.recommendations.length) recommendations.push(input.referenceDelta.recommendations[0]);
    if (input.album?.recommendations.length) recommendations.push(input.album.recommendations[0]);
    if (input.consequence?.riskNotes.length) recommendations.push(input.consequence.summary);
    if (recommendations.length === 0) recommendations.push('The current finish path is coherent enough to trust.');

    const summary = verdict === 'ready'
      ? 'The session is release-safe across narrative, album, reference, and consequence layers.'
      : 'The session still has one or more finish-layer gaps that should be resolved before export.';

    const analysisFingerprint = fnv1aHex(stableSerialize({
      authorityScore,
      verdict,
      narrative: input.narrative?.analysisFingerprint,
      consequence: input.consequence?.analysisFingerprint,
      album: input.album?.analysisFingerprint,
      reference: input.referenceDelta?.analysisFingerprint,
      phaseC: input.phaseCMastering?.finalTranslation.verdict,
    }));

    return {
      shouldApply,
      analysisFingerprint,
      verdict,
      authorityScore,
      summary,
      priorities,
      warnings,
      recommendations,
    };
  }
}

export const analyzeSessionFinishAuthority = SessionFinishAuthority.analyze.bind(SessionFinishAuthority);
