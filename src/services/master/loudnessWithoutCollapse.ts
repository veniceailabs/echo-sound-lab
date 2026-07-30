import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { LowEndDisciplineAnalysis } from '../lowend/lowEndDiscipline';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import { clamp, mean } from '../lowend/lowEndUtils';

export interface LoudnessWithoutCollapseAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  currentLUFS: number;
  targetLUFS: number;
  targetTruePeakDb: number;
  expectedGainDb: number;
  dynamicRangeTargetDb: number;
  headroomDb: number;
  headroomScore: number;
  streamingAlignment: {
    spotify: boolean;
    appleMusic: boolean;
    youtube: boolean;
    tidal: boolean;
  };
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function averageDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(mean(arrangement.sections.map((section) => section.density)), 0, 1);
}

function intentTargetOffset(intent?: VocalIntentAnalysis): number {
  if (!intent) return 0;
  switch (intent.intent) {
    case 'intimate':
    case 'whispered':
      return -0.35;
    case 'aggressive':
    case 'belted':
      return 0.25;
    case 'melodic':
      return -0.1;
    default:
      return 0;
  }
}

export class LoudnessWithoutCollapse {
  public static analyze(
    metrics: APLSignalMetrics,
    arrangement?: ArrangementAnalysis,
    lowEnd?: LowEndDisciplineAnalysis,
    vocalIntent?: VocalIntentAnalysis
  ): LoudnessWithoutCollapseAnalysis {
    const currentLUFS = metrics.loudnessLUFS;
    const density = averageDensity(arrangement);
    const lowEndInstability = lowEnd ? clamp(1 - lowEnd.drumPocket.pocketScore, 0, 1) : 0.35;
    const targetLUFS = clamp(-14 + (density - 0.5) * 0.7 + intentTargetOffset(vocalIntent), -16.5, -12.5);
    const targetTruePeakDb = -1;
    const expectedGainDb = targetLUFS - currentLUFS;
    const dynamicRangeTargetDb = clamp(
      7.6 + (1 - density) * 1.8 + (vocalIntent?.intent === 'intimate' || vocalIntent?.intent === 'whispered' ? 0.8 : 0) - lowEndInstability * 0.6,
      6.5,
      11.5
    );
    const headroomDb = targetTruePeakDb - metrics.truePeakDB;
    const headroomScore = clamp(1 - Math.max(0, metrics.truePeakDB - targetTruePeakDb) / 4, 0, 1);
    const shouldApply = metrics.truePeakDB > 0.5 || Math.abs(metrics.crestFactor - dynamicRangeTargetDb) > 4.8 || (Math.abs(expectedGainDb) > 14 && lowEndInstability > 0.8);

    const streamingAlignment = {
      spotify: Math.abs(targetLUFS - (-14)) <= 1 && targetTruePeakDb <= -1,
      appleMusic: Math.abs(targetLUFS - (-16)) <= 1.2 && targetTruePeakDb <= -1,
      youtube: Math.abs(targetLUFS - (-14)) <= 1 && targetTruePeakDb <= -1,
      tidal: Math.abs(targetLUFS - (-14)) <= 1 && targetTruePeakDb <= -1,
    };

    const rationale = shouldApply
      ? 'The current loudness and headroom need a finishing pass so the master can hit streaming targets without collapsing dynamics.'
      : 'The loudness is close enough to streaming targets that only light finishing is needed.';

    const riskNotes: string[] = [];
    if (Math.abs(expectedGainDb) > 8) riskNotes.push('Large gain moves risk flattening the record instead of finishing it.');
    if (metrics.truePeakDB > -1) riskNotes.push('True peak headroom is too thin for a safe release ceiling.');
    if (dynamicRangeTargetDb < 7) riskNotes.push('Dynamic range target is getting tight enough to sound squeezed if pushed further.');

    const interactionNotes: string[] = [];
    if (lowEnd?.shouldApply) interactionNotes.push('Fix the low end first so loudness does not hide masking problems.');
    if (vocalIntent?.intent === 'intimate') interactionNotes.push('Keep the loudness move smaller so intimacy survives the finish stage.');
    if (vocalIntent?.intent === 'aggressive') interactionNotes.push('Aggressive material can sit a little louder, but the ceiling still needs respect.');

    const overallConfidence = clamp(
      0.44 +
      headroomScore * 0.24 +
      (1 - Math.min(1, Math.abs(expectedGainDb) / 12)) * 0.24 +
      (1 - lowEndInstability) * 0.08,
      0,
      1
    );

    return {
      shouldApply,
      overallConfidence,
      currentLUFS,
      targetLUFS,
      targetTruePeakDb,
      expectedGainDb,
      dynamicRangeTargetDb,
      headroomDb,
      headroomScore,
      streamingAlignment,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}
