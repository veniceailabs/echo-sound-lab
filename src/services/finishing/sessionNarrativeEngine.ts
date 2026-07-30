import type { ArrangementAnalysis, SectionAnalysis } from '../arrangementAnalyzer';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import { clamp, mean } from '../lowend/lowEndUtils';

export type NarrativeBalanceAction = 'lift' | 'duck' | 'transition_shape' | 'hold';
export type NarrativeSectionRole = 'anchor' | 'support' | 'transition';
export type NarrativeArc = 'opening' | 'building' | 'release' | 'plateau' | 'declining' | 'cyclical';

export interface NarrativeBalanceDecision {
  sectionName: string;
  sectionRole: NarrativeSectionRole;
  startTime: number;
  endTime: number;
  energyLevel: number;
  narrativePriority: number;
  action: NarrativeBalanceAction;
  rationale: string;
  listenerConsequence: string;
}

export interface SessionNarrativeAnalysis {
  shouldApply: boolean;
  analysisFingerprint: string;
  overallArc: NarrativeArc;
  hierarchy: {
    anchors: number;
    supports: number;
    transitions: number;
    totalSections: number;
  };
  continuity: {
    tonal: number;
    energy: number;
    pacing: number;
  };
  decisions: NarrativeBalanceDecision[];
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

export interface SessionNarrativeInput {
  arrangement?: ArrangementAnalysis;
  lowEnd?: LowEndDisciplineAnalysis;
  phaseCMastering?: PhaseCMasteringAnalysis;
  vocalIntent?: VocalIntentAnalysis;
  sessionId?: string;
  trackName?: string;
  narrativePriorityBias?: number;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
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

function sectionRole(section: SectionAnalysis): NarrativeSectionRole {
  const name = section.name.toLowerCase();
  if (name.includes('intro') || name.includes('outro') || name.includes('bridge') || name.includes('pre-chorus')) {
    return 'transition';
  }
  if (name.includes('chorus') || name.includes('drop') || section.energy >= 0.72) {
    return 'anchor';
  }
  return 'support';
}

function targetPriority(section: SectionAnalysis, bias: number, role: NarrativeSectionRole): number {
  const roleWeight = role === 'anchor' ? 0.25 : role === 'transition' ? 0.12 : -0.05;
  const densityWeight = clamp01(section.density) * 0.14;
  return clamp01(0.34 + section.energy * 0.34 + densityWeight + roleWeight + bias);
}

function overallArcFromSections(sections: SectionAnalysis[]): NarrativeArc {
  if (sections.length === 0) return 'opening';
  const first = sections[0]?.energy ?? 0;
  const last = sections[sections.length - 1]?.energy ?? first;
  const average = mean(sections.map((section) => section.energy));
  const swing = last - first;

  if (Math.abs(swing) < 0.08 && average > 0.65) return 'plateau';
  if (swing > 0.15) return 'building';
  if (swing < -0.15) return 'declining';
  if (average > 0.7) return 'release';
  return sections.length > 4 ? 'cyclical' : 'opening';
}

export class SessionNarrativeEngine {
  public static analyze(input: SessionNarrativeInput): SessionNarrativeAnalysis {
    const sections = input.arrangement?.sections ?? [];
    const bias = clamp01(input.narrativePriorityBias ?? 0.5) - 0.5;

    const decisions = sections.map((section, index) => {
      const role = sectionRole(section);
      const nextSection = sections[index + 1];
      const deltaToNext = nextSection ? nextSection.energy - section.energy : 0;
      const priority = targetPriority(section, bias, role);

      let action: NarrativeBalanceAction = 'hold';
      if (role === 'transition' || Math.abs(deltaToNext) > 0.18) {
        action = 'transition_shape';
      } else if (priority >= 0.74 && deltaToNext >= -0.05) {
        action = 'lift';
      } else if (priority <= 0.48 || (section.density < 0.28 && section.energy < 0.45)) {
        action = 'duck';
      }

      const listenerConsequence = action === 'lift'
        ? 'This section should feel like the record opens up and commits forward.'
        : action === 'duck'
          ? 'This section should clear space so the next phrase or scene can land.'
          : action === 'transition_shape'
            ? 'This section should guide the listener through the change without a jolt.'
            : 'This section should hold its place and preserve the current narrative balance.';

      const rationale = role === 'anchor'
        ? 'This is a structural anchor that should hold focus and keep the song centered.'
        : role === 'transition'
          ? 'This is a transition zone that should shape momentum instead of competing with the anchor.'
          : 'This section supports the main narrative and should preserve flow rather than over-asserting itself.';

      return {
        sectionName: section.name,
        sectionRole: role,
        startTime: section.startTime,
        endTime: section.endTime,
        energyLevel: clamp01(section.energy),
        narrativePriority: priority,
        action,
        rationale,
        listenerConsequence,
      } satisfies NarrativeBalanceDecision;
    });

    const averageEnergy = sections.length > 0 ? mean(sections.map((section) => section.energy)) : 0.5;
    const averageDensity = sections.length > 0 ? mean(sections.map((section) => section.density)) : 0.5;
    const energyContinuity = sections.length > 1
      ? clamp01(1 - mean(sections.slice(1).map((section, index) => Math.abs(section.energy - sections[index].energy))) * 1.8)
      : 0.72;
    const tonalContinuity = clamp01(1 - Math.abs(averageDensity - 0.5) * 0.8);
    const pacingContinuity = clamp01(1 - Math.min(0.5, Math.abs((sections.length / Math.max(1, (input.phaseCMastering?.finalTranslation.targets.length ?? 4))) - 1) * 0.18));

    const hierarchy = {
      anchors: decisions.filter((decision) => decision.sectionRole === 'anchor').length,
      supports: decisions.filter((decision) => decision.sectionRole === 'support').length,
      transitions: decisions.filter((decision) => decision.sectionRole === 'transition').length,
      totalSections: decisions.length,
    };

    const overallArc = overallArcFromSections(sections);
    const analysisFingerprint = fnv1aHex(
      stableSerialize({
        sessionId: input.sessionId ?? null,
        trackName: input.trackName ?? null,
        hierarchy,
        overallArc,
        energyContinuity,
        tonalContinuity,
        pacingContinuity,
        decisions: decisions.map((decision) => ({
          sectionName: decision.sectionName,
          action: decision.action,
          priority: decision.narrativePriority,
        })),
      })
    );

    const shouldApply = decisions.some((decision) => decision.action !== 'hold');
    const rationale = shouldApply
      ? 'The arrangement has narrative shifts that benefit from explicit lift, duck, and transition shaping.'
      : 'The arrangement is already balanced enough that it can stay mostly on hold.';

    const riskNotes: string[] = [];
    if (averageEnergy > 0.8) riskNotes.push('Very dense or high-energy sections can mask narrative transitions if pushed too hard.');
    if (hierarchy.transitions === 0 && decisions.length > 2) riskNotes.push('No obvious transition sections were detected, so section changes may feel abrupt.');

    const interactionNotes: string[] = [];
    if (input.lowEnd?.shouldApply) interactionNotes.push('Low-end discipline should be locked before heavier narrative lift decisions are applied.');
    if (input.vocalIntent) interactionNotes.push(`Vocal intent is ${input.vocalIntent.intent}, so the narrative should respect delivery emotion.`);
    if (input.phaseCMastering?.shouldApply) interactionNotes.push('Mastering decisions can reinforce or flatten the arc, so narrative and finish should be checked together.');

    return {
      shouldApply,
      analysisFingerprint,
      overallArc,
      hierarchy,
      continuity: {
        tonal: tonalContinuity,
        energy: energyContinuity,
        pacing: pacingContinuity,
      },
      decisions,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzeSessionNarrative = SessionNarrativeEngine.analyze.bind(SessionNarrativeEngine);
