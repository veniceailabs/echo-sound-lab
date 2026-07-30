import type { SpectralProfile } from '../dsp/SpectralAnalyzer';
import type { APLSignalMetrics } from '../../echo-sound-lab/apl/signal-intelligence';
import type { BusGlueAnalysis } from './busGlue';
import type { LoudnessWithoutCollapseAnalysis } from './loudnessWithoutCollapse';
import type { VocalIntentAnalysis } from '../vocal/vocalIntentDetector';
import type { VocalProfile } from '../vocal/vocalProfiler';
import { clamp } from '../lowend/lowEndUtils';

export type TopEndCharacter = 'neutral' | 'warm' | 'air';

export interface TopEndPolishAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  shelfFrequencyHz: number;
  gainDb: number;
  q: number;
  character: TopEndCharacter;
  airWindowHz: { startHz: number; endHz: number };
  harshnessRisk: number;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

function predictedBrightness(spectralProfile: SpectralProfile): number {
  return clamp((spectralProfile.spectralCentroid - 1800) / 2600, 0, 1);
}

function harshnessRisk(
  spectralProfile: SpectralProfile,
  vocalProfile?: VocalProfile,
  vocalIntent?: VocalIntentAnalysis
): number {
  const centroidRisk = clamp((spectralProfile.spectralCentroid - 3200) / 1800, 0, 1);
  const sharpnessRisk = vocalProfile ? clamp(vocalProfile.transientSharpness, 0, 1) * 0.25 : 0.1;
  const breathRisk = vocalProfile ? clamp(vocalProfile.breathiness, 0, 1) * 0.12 : 0.08;
  const intentRisk = vocalIntent && (vocalIntent.intent === 'aggressive' || vocalIntent.intent === 'belted') ? 0.08 : 0;
  return clamp(centroidRisk + sharpnessRisk + breathRisk + intentRisk, 0, 1);
}

export class TopEndPolish {
  public static analyze(
    metrics: APLSignalMetrics,
    spectralProfile: SpectralProfile,
    vocalProfile?: VocalProfile,
    busGlue?: BusGlueAnalysis,
    loudness?: LoudnessWithoutCollapseAnalysis,
    vocalIntent?: VocalIntentAnalysis
  ): TopEndPolishAnalysis {
    const brightness = predictedBrightness(spectralProfile);
    const risk = harshnessRisk(spectralProfile, vocalProfile, vocalIntent);
    const gluePressure = busGlue ? clamp(busGlue.character === 'presence' ? busGlue.overallConfidence * 0.1 : busGlue.overallConfidence * 0.08, 0, 0.12) : 0.06;
    const loudnessPressure = loudness ? clamp((Math.abs(loudness.expectedGainDb) / 8) * 0.15, 0, 0.16) : 0.06;
    const airNeed = clamp((0.38 - brightness) + gluePressure + loudnessPressure, 0, 1);
    const gainDb = clamp(airNeed * 1.2 - risk * 1.5, -1.8, 2.0);
    const normalizedGainDb = Number.isFinite(gainDb) ? gainDb : 0;
    const normalizedBrightness = Number.isFinite(brightness) ? brightness : 0.5;
    const shouldApply = Math.abs(normalizedGainDb) >= 0.95 || (risk > 0.74 && normalizedGainDb < 0) || (normalizedBrightness < 0.18 && normalizedGainDb > 0.7);
    const shelfFrequencyHz = normalizedGainDb >= 0
      ? clamp(8800 + (normalizedBrightness * 4000), 8000, 14000)
      : clamp(6000 + (normalizedBrightness * 2500), 6000, 11000);
    const q = normalizedGainDb >= 0 ? 0.56 : 0.7;
    const character: TopEndCharacter = normalizedGainDb > 1
      ? 'air'
      : normalizedGainDb < 0
        ? 'warm'
        : 'neutral';

    const rationale = shouldApply
      ? 'The top end can be shaped a little more so the master feels expensive without becoming brittle.'
      : 'The top end is already close enough to a finished balance that only subtle polish is needed.';

    const riskNotes: string[] = [];
    if (risk > 0.62 && normalizedGainDb > 0.45) riskNotes.push('The vocal already carries a lot of edge; too much air may expose consonants.');
    if (metrics.spectralCentroid > 3500 && normalizedGainDb > 0) riskNotes.push('The mix is already bright, so any shelf should stay extremely broad and small.');
    if (normalizedGainDb < 0) riskNotes.push('A reduction means the mix is already bright enough and only needs restraint.');

    const interactionNotes: string[] = [];
    if (busGlue && busGlue.character === 'presence') interactionNotes.push('Presence-heavy bus glue can make top-end polish feel more forward than expected.');
    if (loudness && Math.abs(loudness.expectedGainDb) > 2) interactionNotes.push('Large loudness moves will expose the top end more, so keep the shelf conservative.');
    if (vocalIntent?.intent === 'intimate') interactionNotes.push('Intimate vocals usually need less air than an aggressive or anthemic hook.');

    const overallConfidence = clamp(0.44 + (1 - risk) * 0.28 + Math.abs(normalizedGainDb) * 0.12 + (1 - Math.abs(metrics.peakLevel - 0.8)) * 0.16, 0, 1);

    return {
      shouldApply,
      overallConfidence,
      shelfFrequencyHz,
      gainDb,
      q,
      character,
      airWindowHz: {
        startHz: shelfFrequencyHz >= 10000 ? 10000 : 8000,
        endHz: shelfFrequencyHz >= 10000 ? 16000 : 12000,
      },
      harshnessRisk: risk,
      rationale,
      riskNotes,
      interactionNotes,
    };
  }
}
