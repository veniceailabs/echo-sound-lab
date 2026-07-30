import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { SpectralProfile } from '../dsp/SpectralAnalyzer';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { PhaseCMasteringAnalysis } from '../master/phaseCMastering';
import type { SessionNarrativeAnalysis } from './sessionNarrativeEngine';
import type { VocalProfile } from '../vocal/vocalProfiler';
import { clamp, mean } from '../lowend/lowEndUtils';

export type ListenerSystem = 'iphone' | 'car' | 'earbuds' | 'club';
export type PerceptualRiskType = 'fatigue' | 'intelligibility_loss' | 'impact_loss' | 'emotional_flatness';

export interface ListenerConsequenceTarget {
  system: ListenerSystem;
  riskType: PerceptualRiskType;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  confidence: number;
  listenerImpact: string;
  recommendation: string;
  evidence: string[];
  secondaryRiskTypes: PerceptualRiskType[];
}

export interface PerceptualConsequenceAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  analysisFingerprint: string;
  targets: ListenerConsequenceTarget[];
  summary: string;
  riskNotes: string[];
  interactionNotes: string[];
}

export interface PerceptualConsequenceInput {
  metrics: APLSignalMetrics;
  spectralProfile: SpectralProfile;
  arrangement?: ArrangementAnalysis;
  lowEnd?: LowEndDisciplineAnalysis;
  phaseCMastering?: PhaseCMasteringAnalysis;
  vocalProfile?: VocalProfile;
  sessionNarrative?: SessionNarrativeAnalysis;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function severityFromScore(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score >= 0.8) return 'critical';
  if (score >= 0.58) return 'high';
  if (score >= 0.32) return 'moderate';
  return 'low';
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

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp01(mean(arrangement.sections.map((section) => section.density)));
}

function averageEnergy(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp01(mean(arrangement.sections.map((section) => section.energy)));
}

function translationScore(lowEnd?: LowEndDisciplineAnalysis, system: ListenerSystem = 'iphone'): number {
  if (!lowEnd) return 0.62;
  const target = lowEnd.translationValidation.targets.find((entry) => entry.device === system);
  return clamp01(target ? target.score : 0.62);
}

function consequenceForSystem(input: PerceptualConsequenceInput, system: ListenerSystem): ListenerConsequenceTarget {
  const centroid = Number.isFinite(input.spectralProfile.spectralCentroid) ? input.spectralProfile.spectralCentroid : 0;
  const normalizedCentroid = clamp01(Math.max(0, centroid - 1400) / 3200);
  const crest = clamp01((Number.isFinite(input.metrics.crestFactor) ? input.metrics.crestFactor : 0) / 12);
  const loudnessRange = clamp01((Number.isFinite(input.metrics.loudnessRange) ? input.metrics.loudnessRange : 0) / 12);
  const density = averageDensity(input.arrangement);
  const energy = averageEnergy(input.arrangement);
  const vocalSharpness = clamp01(input.vocalProfile?.transientSharpness ?? 0.45);
  const breathiness = clamp01(input.vocalProfile?.breathiness ?? 0.3);
  const lowEndScore = translationScore(input.lowEnd, system);
  const finishScore = input.phaseCMastering
    ? clamp01(input.phaseCMastering.finalTranslation.targets.find((target) => target.device === system)?.score ?? 0.7)
    : 0.7;

  const fatigueScore = clamp01(
    normalizedCentroid * 0.45 +
    crest * 0.25 +
    vocalSharpness * 0.2 +
    density * 0.1
  );

  const intelligibilityScore = clamp01(
    density * 0.34 +
    (1 - normalizedCentroid) * 0.24 +
    breathiness * 0.24 +
    (1 - finishScore) * 0.18
  );

  const impactScore = clamp01(
    (1 - lowEndScore) * 0.44 +
    (1 - crest) * 0.22 +
    (1 - loudnessRange) * 0.2 +
    density * 0.14
  );

  const emotionalFlatnessScore = clamp01(
    (1 - energy) * 0.3 +
    (1 - loudnessRange) * 0.3 +
    (1 - finishScore) * 0.25 +
    (1 - crest) * 0.15
  );

  const riskMap: Record<PerceptualRiskType, number> = {
    fatigue: fatigueScore,
    intelligibility_loss: intelligibilityScore,
    impact_loss: impactScore,
    emotional_flatness: emotionalFlatnessScore,
  };

  let riskType: PerceptualRiskType = 'fatigue';
  let maxScore = riskMap.fatigue;
  const secondaryRiskTypes: PerceptualRiskType[] = [];

  for (const [candidateRisk, score] of Object.entries(riskMap) as Array<[PerceptualRiskType, number]>) {
    if (score > maxScore) {
      secondaryRiskTypes.push(riskType);
      riskType = candidateRisk;
      maxScore = score;
    } else if (score >= 0.42 && candidateRisk !== riskType) {
      secondaryRiskTypes.push(candidateRisk);
    }
  }

  const severity = severityFromScore(maxScore);
  const confidence = clamp01(0.45 + maxScore * 0.4 + finishScore * 0.15);

  const listenerImpactBySystem: Record<ListenerSystem, string> = {
    iphone: 'Upper mids and vocal edge will dominate first; harshness or vocal masking is the primary risk.',
    car: 'Kick, bass, and punch will be exposed immediately; if the foundation is unstable, the record will feel smaller.',
    earbuds: 'Repeated playback can make the top end feel tiring or too clean if the vocal is over-shaped.',
    club: 'The record may lose impact if the finish is too polite or if the transient envelope collapses.',
  };

  const recommendationBySystem: Record<ListenerSystem, string> = {
    iphone: 'Protect vocal intelligibility and keep the upper mids controlled without flattening the emotional lift.',
    car: 'Keep the low end disciplined and avoid chasing loudness that blurs drum pocket or bass definition.',
    earbuds: 'Back off brittle presence boosts and preserve enough contrast so repeated playback stays comfortable.',
    club: 'Keep the transient spine and low-end impact intact instead of over-thickening the bus finish.',
  };

  const evidence = [
    `spectralCentroid=${centroid.toFixed(1)}Hz`,
    `crestFactor=${Number.isFinite(input.metrics.crestFactor) ? input.metrics.crestFactor.toFixed(2) : '0.00'}`,
    `loudnessRange=${Number.isFinite(input.metrics.loudnessRange) ? input.metrics.loudnessRange.toFixed(2) : '0.00'}`,
    `density=${density.toFixed(2)}`,
    `finishScore=${finishScore.toFixed(2)}`,
  ];

  return {
    system,
    riskType,
    severity,
    confidence,
    listenerImpact: listenerImpactBySystem[system],
    recommendation: recommendationBySystem[system],
    evidence,
    secondaryRiskTypes: Array.from(new Set(secondaryRiskTypes)),
  };
}

export class PerceptualConsequenceEngine {
  public static analyze(input: PerceptualConsequenceInput): PerceptualConsequenceAnalysis {
    const targets: ListenerConsequenceTarget[] = [
      consequenceForSystem(input, 'iphone'),
      consequenceForSystem(input, 'car'),
      consequenceForSystem(input, 'earbuds'),
      consequenceForSystem(input, 'club'),
    ];

    const highestSeverityWeight: Record<ListenerConsequenceTarget['severity'], number> = {
      low: 0.18,
      moderate: 0.42,
      high: 0.68,
      critical: 0.9,
    };

    const overallRisk = clamp01(mean(targets.map((target) => highestSeverityWeight[target.severity])));
    const overallConfidence = clamp01(mean(targets.map((target) => target.confidence)));
    const analysisFingerprint = fnv1aHex(
      stableSerialize({
        metrics: {
          loudnessLUFS: input.metrics.loudnessLUFS,
          crestFactor: input.metrics.crestFactor,
          spectralCentroid: input.spectralProfile.spectralCentroid,
          loudnessRange: input.metrics.loudnessRange,
        },
        arrangement: input.arrangement ? {
          sections: input.arrangement.sections.length,
          flow: input.arrangement.overallFlow,
        } : null,
        lowEnd: input.lowEnd ? {
          verdict: input.lowEnd.verdict,
          translation: input.lowEnd.translationValidation.verdict,
        } : null,
        phaseC: input.phaseCMastering ? {
          verdict: input.phaseCMastering.verdict,
          finalTranslation: input.phaseCMastering.finalTranslation.verdict,
        } : null,
        targets: targets.map((target) => ({
          system: target.system,
          riskType: target.riskType,
          severity: target.severity,
        })),
      })
    );

    const summary = targets
      .map((target) => `${target.system}: ${target.riskType.replace(/_/g, ' ')} (${target.severity})`)
      .join(' • ');

    const riskNotes = Array.from(new Set(
      targets
        .filter((target) => target.severity !== 'low')
        .map((target) => `${target.system} needs ${target.riskType.replace(/_/g, ' ')} attention.`)
    ));

    const interactionNotes: string[] = [];
    if (input.sessionNarrative) {
      interactionNotes.push(`Narrative arc is ${input.sessionNarrative.overallArc}, so consequence checks should track section transitions instead of only whole-track averages.`);
    }
    if (input.lowEnd?.shouldApply) {
      interactionNotes.push('Low-end discipline should be locked before trusting car and club consequence scores.');
    }
    if (input.phaseCMastering?.shouldApply) {
      interactionNotes.push('Finish-layer decisions can reduce or amplify listener fatigue, so they should be evaluated together.');
    }

    return {
      shouldApply: overallRisk >= 0.28,
      overallConfidence,
      analysisFingerprint,
      targets,
      summary,
      riskNotes,
      interactionNotes,
    };
  }
}

export const analyzePerceptualConsequences = PerceptualConsequenceEngine.analyze.bind(PerceptualConsequenceEngine);
