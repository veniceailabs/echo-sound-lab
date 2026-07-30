import { VocalIntakeConditioningService } from './vocal/intakeConditioning';
import { VocalProfiler } from './vocal/vocalProfiler';
import {
  REFERENCE_WORLD_PROFILES,
  resolveReferenceWorldPitchPreset,
  type ReferenceWorldProfileId,
} from './finishing/referenceWorldEngine';

export type RecordingIntakeVerdict = 'ready' | 'borderline' | 're-record';

export interface RecordingIntakeAnalysis {
  verdict: RecordingIntakeVerdict;
  durationSec: number;
  peak: number;
  rms: number;
  crestFactor: number;
  clippingDetected: boolean;
  silenceRatio: number;
  likelyVoiceType: string;
  recommendedWorldId: ReferenceWorldProfileId;
  recommendedPitchPreset: ReturnType<typeof resolveReferenceWorldPitchPreset>;
  summary: string;
  recommendation: string;
}

function getBestWorldId(profile: ReturnType<typeof VocalProfiler.profile>): ReferenceWorldProfileId {
  if (profile.warmth >= 0.62 && profile.breathiness >= 0.45) {
    return 'melodic_rnb_showcase';
  }
  if (profile.tightness >= 0.58 && profile.tightness <= 0.82) {
    return 'commercial_rap_polish';
  }
  if (profile.nasality >= 0.42 || profile.transientSharpness <= 0.56) {
    return 'lyrical_clarity';
  }
  return 'balanced_modern_release';
}

export class RecordingIntakeService {
  public static analyze(audioBuffer: AudioBuffer): RecordingIntakeAnalysis {
    const conditioning = VocalIntakeConditioningService.condition(audioBuffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const recommendedWorldId = getBestWorldId(profile);
    const recommendedPitchPreset = resolveReferenceWorldPitchPreset(recommendedWorldId);
    const durationSec = Math.max(0, conditioning.conditionedBuffer.duration);
    const clippingDetected = conditioning.report.gainStaging.clipping;
    const silenceRatio = conditioning.report.noiseSources.noiseFloorDb <= -58 ? 0.12 : 0.04;
    const crestFactor = Math.max(0, conditioning.report.dynamics.levelVariationDb);
    const rms = profile.rmsLevelDb;
    const peak = conditioning.report.gainStaging.peakLevelDb;

    let verdict: RecordingIntakeVerdict = 'ready';
    if (clippingDetected || durationSec < 4) {
      verdict = 're-record';
    } else if (durationSec < 8 || conditioning.report.noiseSources.noiseFloorDb > -42) {
      verdict = 'borderline';
    }

    const summary = verdict === 'ready'
      ? `The take is stable enough to tune and move into the finish path.`
      : verdict === 'borderline'
        ? 'The take is usable, but a cleaner capture will improve the final result.'
        : 'This take should be re-recorded before it becomes the main performance.';

    const recommendation = clippingDetected
      ? 'Back the input down and re-record with safer headroom.'
      : durationSec < 8
        ? 'Record a longer pass so the tune and comping engines have more material.'
        : `Use the ${REFERENCE_WORLD_PROFILES.find((p) => p.id === recommendedWorldId)?.label} preset as the starting lane.`;

    return {
      verdict,
      durationSec,
      peak,
      rms,
      crestFactor,
      clippingDetected,
      silenceRatio,
      likelyVoiceType: profile.voiceType,
      recommendedWorldId,
      recommendedPitchPreset,
      summary,
      recommendation,
    };
  }
}

export const analyzeRecordingIntake = RecordingIntakeService.analyze.bind(RecordingIntakeService);
