import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import { clamp, mean } from '../lowend/lowEndUtils';

export type BusGlueCharacter = 'neutral' | 'warm' | 'presence';

export interface BusGlueAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  ratio: number;
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
  mix: number;
  character: BusGlueCharacter;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

export class BusGlue {
  public static analyze(
    metrics: APLSignalMetrics,
    arrangement?: ArrangementAnalysis,
    lowEnd?: LowEndDisciplineAnalysis,
    vocalIntent?: VocalIntentAnalysis
  ): BusGlueAnalysis {
    const arrangementDensity = averageDensity(arrangement);
    const crest = Number.isFinite(metrics.crestFactor) ? metrics.crestFactor : 0;
    const lowEndInstability = lowEnd ? clamp(1 - lowEnd.drumPocket.pocketScore, 0, 1) : 0.45;
    const intentIntensity = vocalIntent
      ? clamp((vocalIntent.indicators.aggression + vocalIntent.indicators.dynamicsIntensity) / 2, 0, 1)
      : 0.5;

    const need = clamp(
      ((crest - 4.5) / 7) * 0.36 +
      arrangementDensity * 0.24 +
      lowEndInstability * 0.22 +
      intentIntensity * 0.12,
      0,
      1
    );

    const loudnessCeiling = Number.isFinite(metrics.loudnessLUFS) ? metrics.loudnessLUFS : -60;
    const shouldApply = need > 0.58 && loudnessCeiling > -24;
    const ratio = clamp(1.35 + need * 0.65, 1.35, 2.0);
    const thresholdDb = clamp(-18 + (1 - need) * 3.5 - (arrangementDensity - 0.5) * 1.8, -24, -10);
    const attackMs = clamp(24 - need * 10 - intentIntensity * 4, 8, 30);
    const releaseMs = clamp(120 + arrangementDensity * 70 + lowEndInstability * 40, 100, 300);
    const makeupDb = clamp(0.5 + need * 1.4, 0, 3);
    const mix = 1;

    const character: BusGlueCharacter = arrangementDensity > 0.7
      ? 'presence'
      : lowEndInstability > 0.45 || vocalIntent?.intent === 'intimate'
        ? 'warm'
        : 'neutral';

    const rationale = shouldApply
      ? 'The master bus can use a gentle glue stage to keep the record cohesive without flattening the groove.'
      : 'The mix is already cohesive enough that only very subtle bus glue would be needed.';

    const riskNotes: string[] = [];
    if (ratio > 1.8) riskNotes.push('The glue ratio is high enough to start shrinking the mix if pushed further.');
    if (attackMs < 12) riskNotes.push('A very fast attack could blunt the transient feel of the record.');
    if (arrangementDensity > 0.75) riskNotes.push('Dense sections will expose overly aggressive bus compression quickly.');

    const interactionNotes: string[] = [];
    if (lowEnd?.shouldApply) interactionNotes.push('Lock the low end first so bus glue does not turn masking into density.');
    if (vocalIntent?.intent === 'aggressive') interactionNotes.push('Aggressive delivery can tolerate a little more bus cohesion without losing bite.');
    if (vocalIntent?.intent === 'intimate') interactionNotes.push('Keep the attack slower so the vocal stays emotionally open.');

    const overallConfidence = clamp(0.44 + need * 0.34 + arrangementDensity * 0.1 + Math.min(1, crest / 12) * 0.12, 0, 1);

    return {
      shouldApply,
      overallConfidence,
      ratio,
      thresholdDb,
      attackMs,
      releaseMs,
      makeupDb,
      mix,
      character,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}
