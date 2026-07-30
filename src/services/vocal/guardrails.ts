import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { AdLibPlacementAnalysis } from './adlibPlacement';
import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { DeEssingAnalysis } from './deEssingZones';
import type { DelayAutomationAnalysis } from './delayAutomationLogic';
import type { HookLiftAnalysis } from './hookLiftLogic';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { VocalProfile } from './vocalProfiler';

export type VocalGuardrailSeverity = 'info' | 'warning' | 'error';
export type VocalGuardrailVerdict = 'green' | 'yellow' | 'red';

export interface VocalGuardrailCheck {
  check: string;
  severity: VocalGuardrailSeverity;
  detected: boolean;
  message: string;
  suggestion: string;
  confidence: number;
}

export interface VocalGuardrailAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  score: number;
  verdict: VocalGuardrailVerdict;
  checks: VocalGuardrailCheck[];
  warningCount: number;
  errorCount: number;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  skipReason?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function sumTopEndLift(presenceAir: PresenceAirAnalysis): number {
  return (
    presenceAir.presenceTargets.reduce((sum, target) => sum + target.gainDb, 0) +
    presenceAir.airTargets.reduce((sum, target) => sum + target.gainDb, 0)
  );
}

function maxPresenceGain(presenceAir: PresenceAirAnalysis): number {
  return Math.max(
    0,
    ...presenceAir.presenceTargets.map((target) => target.gainDb),
    ...presenceAir.airTargets.map((target) => target.gainDb)
  );
}

function maxCompressionRatio(compression: CompressionStackAnalysis): number {
  return Math.max(...compression.primaryStack.map((stage) => stage.ratio), 0);
}

function totalCompressionWeight(compression: CompressionStackAnalysis): number {
  if (compression.primaryStack.length === 0) return 0;
  const weighted = compression.primaryStack.reduce((sum, stage) => {
    const mixWeight = clamp(stage.mix, 0.2, 1);
    return sum + (stage.ratio - 1) * mixWeight;
  }, 0);
  return weighted / compression.primaryStack.length;
}

function hookWidenAmount(hookLift: HookLiftAnalysis): number {
  const widening = hookLift.tactics.find((tactic) => tactic.tactic === 'widen');
  if (!widening) return 0;
  return widening.setting.find((setting) => setting.parameter === 'hook_stereo_width')?.value ?? 1;
}

function hookPresenceGain(hookLift: HookLiftAnalysis): number {
  const presence = hookLift.tactics.find((tactic) => tactic.tactic === 'presence');
  if (!presence) return 0;
  return presence.setting.find((setting) => setting.parameter === 'hook_presence_gain_db')?.value ?? 0;
}

function sumDelayWet(delay: DelayAutomationAnalysis): number {
  return delay.primaryRecommendation?.wetLevel ?? 0;
}

function sumAdLibWet(adLibPlacement: AdLibPlacementAnalysis): number {
  return adLibPlacement.primaryRecommendation?.reverbMix ?? 0;
}

function buildCheck(
  check: string,
  severity: VocalGuardrailSeverity,
  detected: boolean,
  message: string,
  suggestion: string,
  confidence: number
): VocalGuardrailCheck {
  return {
    check,
    severity,
    detected,
    message,
    suggestion,
    confidence: clamp(confidence, 0, 1),
  };
}

export class VocalGuardrails {
  public static analyze(
    profile: VocalProfile,
    deEssing: DeEssingAnalysis,
    compression: CompressionStackAnalysis,
    presenceAir: PresenceAirAnalysis,
    delay: DelayAutomationAnalysis,
    hookLift: HookLiftAnalysis,
    adLibPlacement: AdLibPlacementAnalysis,
    arrangement?: ArrangementAnalysis
  ): VocalGuardrailAnalysis {
    const topEndLift = sumTopEndLift(presenceAir);
    const brightestTargetGain = maxPresenceGain(presenceAir);
    const maxRatio = maxCompressionRatio(compression);
    const compressionWeight = totalCompressionWeight(compression);
    const hookWidth = hookWidenAmount(hookLift);
    const hookPresence = hookPresenceGain(hookLift);
    const delayWet = sumDelayWet(delay);
    const adLibWet = sumAdLibWet(adLibPlacement);
    const sectionDensity = arrangement
      ? arrangement.sections.reduce((sum, section) => sum + section.density * section.energy, 0) / Math.max(arrangement.sections.length, 1)
      : 0.55;
    const hookLiftAmount = hookLift.amountOfLift;
    const adLibWidth = adLibPlacement.primaryRecommendation?.stereoWidth ?? 0;

    const checks: VocalGuardrailCheck[] = [];

    const hollowBright = (
      deEssing.shouldApply &&
      topEndLift > 3 &&
      brightestTargetGain > 1.65 &&
      (presenceAir.warnings.length > 0 || deEssing.overallConfidence > 0.6)
    );
    checks.push(buildCheck(
      'hollow_bright_top',
      hollowBright ? 'warning' : 'info',
      hollowBright,
      'De-essing and presence lift are both active enough that the vocal may lose body while still sounding bright.',
      'Reduce the broad presence boost slightly or keep the de-esser broader so the vocal retains chest and formant weight.',
      hollowBright ? 0.82 : 0.44
    ));

    const brittleTopEnd = (
      topEndLift > 4.5 ||
      (profile.breathiness > 0.55 && brightestTargetGain > 2) ||
      (presenceAir.warnings.length > 0 && topEndLift > 3.4)
    );
    checks.push(buildCheck(
      'brittle_top_end',
      brittleTopEnd ? 'warning' : 'info',
      brittleTopEnd,
      'The chain is leaning hard enough into upper-band polish that the vocal could turn glassy or brittle.',
      'Back off one upper shelf or keep the air boost broader and lower in magnitude.',
      brittleTopEnd ? 0.84 : 0.42
    ));

    const overCompression = (
      maxRatio >= 5.8 ||
      (compression.strategy === 'two_stage' && compressionWeight > 3.1) ||
      (profile.dynamicRangeDb < 6.5 && compression.strategy !== 'single_stage') ||
      (profile.transientSharpness < 0.3 && compressionWeight > 2.3)
    );
    checks.push(buildCheck(
      'over_compression',
      overCompression ? 'error' : 'info',
      overCompression,
      'The compression chain is likely doing too much work for a vocal that still needs some dynamic life.',
      'Reduce the first-stage ratio or raise thresholds so the vocal stays animated instead of flat.',
      overCompression ? 0.9 : 0.46
    ));

    const phaseyWidening = (
      hookWidth > 1.18 ||
      (hookLiftAmount > 0.48 && hookWidth > 1.12) ||
      (hookWidth > 1.1 && adLibWidth > 0.6 && sectionDensity > 0.6)
    );
    checks.push(buildCheck(
      'phasey_hook_widening',
      phaseyWidening ? 'warning' : 'info',
      phaseyWidening,
      'Hook widening and supporting vocal width are stacking enough that the chorus could feel phasey or smeared.',
      'Pull the hook width back slightly or keep the ad-libs narrower and closer to the lead.',
      phaseyWidening ? 0.88 : 0.41
    ));

    const adLibClutter = (
      adLibPlacement.shouldApply &&
      delay.shouldApply &&
      (delayWet + adLibWet > 0.46 || sectionDensity > 0.64 || hookLiftAmount > 0.35)
    );
    checks.push(buildCheck(
      'ad_lib_clutter',
      adLibClutter ? 'warning' : 'info',
      adLibClutter,
      'Delay throws and ad-lib placement are both active enough that the support layers may compete with the lead.',
      'Keep one support layer drier or quieter, and avoid overlapping throws in the same hook phrase.',
      adLibClutter ? 0.81 : 0.45
    ));

    const presenceZoneStacking = (
      topEndLift > 3.7 &&
      hookPresence > 1.45 &&
      (presenceAir.presenceTargets.length > 0 || presenceAir.airTargets.length > 0) &&
      (hookLiftAmount > 0.34 || compression.strategy !== 'single_stage')
    );
    checks.push(buildCheck(
      'presence_zone_stacking',
      presenceZoneStacking ? 'warning' : 'info',
      presenceZoneStacking,
      'Multiple decisions are landing in the same presence band, which can make the vocal sound sharp without sounding clearer.',
      'Spread the energy across tone, width, or movement instead of adding another boost in the same 2-5kHz zone.',
      presenceZoneStacking ? 0.83 : 0.43
    ));

    const warningCount = checks.filter((check) => check.detected && check.severity === 'warning').length;
    const errorCount = checks.filter((check) => check.detected && check.severity === 'error').length;
    const detectedCount = checks.filter((check) => check.detected).length;

    const score = clamp(
      100 -
        warningCount * 12 -
        errorCount * 24 -
        (detectedCount > 3 ? (detectedCount - 3) * 4 : 0),
      0,
      100
    );

    const verdict: VocalGuardrailVerdict = errorCount > 0
      ? 'red'
      : warningCount > 0
        ? 'yellow'
        : 'green';

    const overallConfidence = clamp(
      checks.reduce((sum, check) => sum + (check.detected ? check.confidence : 1 - check.confidence * 0.3), 0) / checks.length,
      0,
      1
    );

    const riskNotes = checks
      .filter((check) => check.detected)
      .map((check) => check.message);
    const interactionNotes = [
      `Top-end lift: ${topEndLift.toFixed(2)} dB; compression weight: ${compressionWeight.toFixed(2)}; section density: ${sectionDensity.toFixed(2)}.`,
      `Delay wet ${delayWet.toFixed(2)} and ad-lib reverb ${adLibWet.toFixed(2)} were evaluated together to catch layered clutter.`,
      `Hook width ${hookWidth.toFixed(2)} and hook presence gain ${hookPresence.toFixed(2)} were checked against the support layers.`,
    ];

    const shouldApply = detectedCount > 0;
    if (!shouldApply) {
      return {
        shouldApply: false,
        overallConfidence,
        score,
        verdict,
        checks,
        warningCount,
        errorCount,
        rationale: 'The vocal chain is internally balanced enough that no guardrail intervention is needed.',
        riskNotes: ['The stack is stable and does not need corrective action right now.'],
        interactionNotes,
        skipReason: 'No combined failure mode detected.',
      };
    }

    return {
      shouldApply: true,
      overallConfidence,
      score,
      verdict,
      checks,
      warningCount,
      errorCount,
      rationale: errorCount > 0
        ? 'The vocal chain has at least one destructive interaction that should be corrected before finalizing the move.'
        : 'The vocal chain is mostly sound, but a few interaction-level cautions are worth addressing.',
      riskNotes,
      interactionNotes,
    };
  }
}

export const vocalGuardrails = VocalGuardrails;
