import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { VocalIntakeConditioningReport } from './intakeConditioning';
import type { DeEssingAnalysis } from './deEssingZones';
import type { VocalProfile } from './vocalProfiler';

export type PresenceAirGoal = 'intelligibility' | 'polish' | 'openness' | 'luxury' | 'cut_through';

export interface PresenceAirTarget {
  band: 'presence' | 'air';
  targetFrequencyHz: number;
  frequencyStartHz: number;
  frequencyEndHz: number;
  gainDb: number;
  q: number;
  confidence: number;
  goal: PresenceAirGoal;
  rationale: string;
  warning?: string;
}

export interface PresenceAirAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  presenceTargets: PresenceAirTarget[];
  airTargets: PresenceAirTarget[];
  rationale: string;
  interactionNotes: string[];
  riskNotes: string[];
  warnings: string[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function highestSibilanceConfidence(deEssing: DeEssingAnalysis): number {
  return deEssing.zones.reduce((max, zone) => Math.max(max, zone.confidence), 0);
}

function compressionBrightnessFactor(compression: CompressionStackAnalysis): number {
  const stageBoost = compression.primaryStack.reduce((sum, stage) => {
    if (stage.goal === 'glue') return sum + 0.08;
    if (stage.goal === 'density') return sum + 0.12;
    if (stage.goal === 'transient_control') return sum + 0.06;
    return sum + 0.04;
  }, 0);

  return clamp(0.65 + stageBoost, 0, 1.2);
}

function voicePresenceCenter(profile: VocalProfile): number {
  switch (profile.voiceType) {
    case 'soprano':
      return 4300;
    case 'alto':
      return 3900;
    case 'tenor':
      return 3300;
    case 'baritone':
      return 2900;
    case 'bass':
      return 2600;
    default:
      return 3200;
  }
}

function voiceAirCenter(profile: VocalProfile): number {
  switch (profile.voiceType) {
    case 'soprano':
      return 11000;
    case 'alto':
      return 11500;
    case 'tenor':
      return 12000;
    case 'baritone':
      return 12500;
    case 'bass':
      return 13000;
    default:
      return 12000;
  }
}

function determinePresenceGain(
  profile: VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  deEssing: DeEssingAnalysis,
  compression: CompressionStackAnalysis
): { gainDb: number; warning?: string; goal: PresenceAirGoal } {
  const sibilance = highestSibilanceConfidence(deEssing);
  const brightnessFactor = compressionBrightnessFactor(compression);
  const clarityNeed = clamp(
    (1 - profile.warmth) * 0.35 +
    (1 - profile.tightness) * 0.2 +
    (1 - profile.transientSharpness) * 0.15 +
    (conditioning.micProximity.compensationNeeded ? 0.08 : 0) +
    (profile.voiceTypeConfidence > 0.7 ? 0.04 : 0.08),
    0,
    1
  );

  let gainDb = clamp(0.5 + clarityNeed * 3.5, 0, 5);
  let goal: PresenceAirGoal = clarityNeed > 0.65 ? 'cut_through' : 'intelligibility';

  if (profile.breathiness > 0.6 || brightnessFactor > 0.9) {
    gainDb = clamp(gainDb - 1.25, 0, 3.5);
    goal = 'polish';
  }

  if (sibilance > 0.75 && deEssing.shouldApply) {
    gainDb = clamp(gainDb - 0.85, 0, 3);
    goal = 'intelligibility';
  }

  if (profile.nasality > 0.6) {
    gainDb = clamp(gainDb - 0.35, 0, 2.8);
  }

  if (conditioning.noiseSources.breathiness > 0.35) {
    gainDb = clamp(gainDb - 0.25, 0, 2.5);
  }

  const warning = gainDb >= 3.2 && sibilance > 0.45
    ? 'Presence boost is large enough to re-emphasize consonants; verify de-essing order.'
    : brightnessFactor > 1
      ? 'Compression already adds top-end detail; keep the presence lift smooth and wide.'
      : undefined;

  return { gainDb, warning, goal };
}

function determineAirGain(
  profile: VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  deEssing: DeEssingAnalysis,
  compression: CompressionStackAnalysis
): { gainDb: number; warning?: string; goal: PresenceAirGoal } {
  const sibilance = highestSibilanceConfidence(deEssing);
  const brightnessFactor = compressionBrightnessFactor(compression);
  const opennessNeed = clamp(
    (profile.breathiness * 0.32) +
    (1 - profile.warmth) * 0.18 +
    (1 - profile.dynamicRangeDb / 12) * 0.16 +
    (compression.strategy === 'single_stage' ? 0.08 : 0) +
    (brightnessFactor < 0.88 ? 0.08 : -0.1),
    0,
    1
  );

  let gainDb = clamp(0.4 + opennessNeed * 3.6, 0, 4.5);
  let goal: PresenceAirGoal = opennessNeed > 0.6 ? 'luxury' : 'openness';

  if (conditioning.noiseSources.hum50Hz || conditioning.noiseSources.hum60Hz) {
    gainDb = clamp(gainDb - 0.2, 0, 3.8);
  }

  if (sibilance > 0.7 && deEssing.shouldApply) {
    gainDb = clamp(gainDb - 0.7, 0, 3.4);
    goal = 'polish';
  }

  if (profile.transientSharpness > 0.58) {
    gainDb = clamp(gainDb - 0.35, 0, 3.2);
  }

  if (profile.warmth > 0.6) {
    gainDb = clamp(gainDb + 0.15, 0, 3.5);
  }

  const warning = gainDb >= 2.8 && brightnessFactor > 0.95
    ? 'Compression is already opening the top end; keep air boosts restrained.'
    : profile.breathiness > 0.65 && gainDb > 2.2
      ? 'Breathy vocals can turn brittle if the air shelf is too high.'
      : undefined;

  return { gainDb, warning, goal };
}

export class VocalPresenceAirTuning {
  public static analyze(
    profile: VocalProfile,
    conditioning: VocalIntakeConditioningReport,
    deEssing: DeEssingAnalysis,
    compression: CompressionStackAnalysis
  ): PresenceAirAnalysis {
    const presence = determinePresenceGain(profile, conditioning, deEssing, compression);
    const air = determineAirGain(profile, conditioning, deEssing, compression);
    const brightnessFactor = compressionBrightnessFactor(compression);
    const sibilance = highestSibilanceConfidence(deEssing);

    const presenceCenter = voicePresenceCenter(profile);
    const airCenter = voiceAirCenter(profile);

    const presenceTarget: PresenceAirTarget = {
      band: 'presence',
      targetFrequencyHz: presenceCenter,
      frequencyStartHz: clamp(presenceCenter - 900, 1800, 5200),
      frequencyEndHz: clamp(presenceCenter + 900, 2200, 6200),
      gainDb: presence.gainDb,
      q: 0.7,
      confidence: clamp(0.58 + profile.voiceTypeConfidence * 0.14 + presence.gainDb * 0.04 - sibilance * 0.08, 0, 1),
      goal: presence.goal,
      rationale: profile.warmth < 0.5
        ? 'Add intelligibility and forwardness without forcing a narrow peak.'
        : 'Use a smoother presence lift to keep the vocal clear while retaining body.',
      warning: presence.warning,
    };

    const airTarget: PresenceAirTarget = {
      band: 'air',
      targetFrequencyHz: airCenter,
      frequencyStartHz: clamp(airCenter - 2500, 8000, 14000),
      frequencyEndHz: clamp(airCenter + 2200, 10000, 16000),
      gainDb: air.gainDb,
      q: 0.55,
      confidence: clamp(0.56 + profile.voiceTypeConfidence * 0.12 + air.gainDb * 0.05 - brightnessFactor * 0.05, 0, 1),
      goal: air.goal,
      rationale: profile.breathiness > 0.45
        ? 'Open the top end subtly so the vocal feels expensive, not brittle.'
        : 'A restrained shelf can add luxury and depth to the upper register.',
      warning: air.warning,
    };

    const warnings: string[] = [];
    if (presence.warning) warnings.push(presence.warning);
    if (air.warning) warnings.push(air.warning);
    if (sibilance > 0.7 && (presence.gainDb > 2 || air.gainDb > 2)) {
      warnings.push('High presence/air with strong sibilance can pull consonants forward; verify de-essing placement.');
    }
    if (profile.transientSharpness > 0.6 && air.gainDb > 2.2) {
      warnings.push('Highly sharp transients can make a big air shelf feel glassy; keep the shelf broad.');
    }

    const interactionNotes = [
      compression.strategy === 'two_stage'
        ? 'Two-stage compression can already add perceived clarity; treat top-end EQ as refinement, not rescue.'
        : compression.strategy === 'parallel'
          ? 'Parallel compression preserves dry detail, so presence/air should stay conservative.'
          : 'Single-stage compression leaves more room for presence and air shaping, but the lifts should remain subtle.',
      deEssing.shouldApply
        ? `De-essing placement is ${compression.ordering.deEssingPlacement}; respect that order before applying any upper-band boost.`
        : 'No concentrated sibilance detected, but brightening still needs to stay smooth to avoid false harshness.',
      `Compression brightness factor: ${brightnessFactor.toFixed(2)}.`,
    ];

    const riskNotes = [
      profile.nasality > 0.55 ? 'Presence boosts can emphasize nasal resonance; avoid narrow boosts around 2.5-4kHz.' : 'Use broad curves to keep the vocal natural.',
      profile.breathiness > 0.55 ? 'Breathy vocals need restrained air to avoid hiss-like top end.' : 'Air can be lifted slightly more if the vocal is dense.',
      compression.strategy !== 'single_stage' ? 'Compression may already expose consonants, so upper boosts should be incremental.' : 'Single-stage compression gives more flexibility, but still avoid aggressive shelves.',
    ];

    const overallConfidence = clamp(
      (presenceTarget.confidence + airTarget.confidence) / 2 -
      (warnings.length > 0 ? 0.04 : 0),
      0,
      1
    );

    return {
      shouldApply: presence.gainDb > 0 || air.gainDb > 0,
      overallConfidence,
      presenceTargets: presence.gainDb > 0 ? [presenceTarget] : [],
      airTargets: air.gainDb > 0 ? [airTarget] : [],
      rationale: [
        `Presence target centered around ${presenceCenter}Hz; air target centered around ${airCenter}Hz.`,
        `Presence gain ${presence.gainDb.toFixed(1)} dB and air gain ${air.gainDb.toFixed(1)} dB were derived from vocal context, de-essing, and compression behavior.`,
      ].join(' '),
      interactionNotes,
      riskNotes,
      warnings,
    };
  }
}

export const vocalPresenceAirTuning = VocalPresenceAirTuning;
