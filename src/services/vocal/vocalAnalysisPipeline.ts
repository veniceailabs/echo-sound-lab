/**
 * Vocal Analysis Pipeline — orchestrates all vocal analysis services
 * and translates their findings into a ProcessingConfig for the DSP engine.
 *
 * Flow:
 *   AudioBuffer
 *     → VocalIntakeConditioningService.condition() — repair + metadata
 *     → VocalProfiler.profile()                   — voice type, formants, dynamics
 *     → VocalDeEssingZoneDetector.analyze()        — sibilance zone map
 *     → VocalCompressionStackLogic.analyze()       — stage recommendations + ordering
 *     → VocalPresenceAirTuning.analyze()           — EQ targets for presence + air bands
 *     → VocalContextAwareness.analyze()            — arrangement-aware adjustments
 *     → VocalHookLiftLogic.analyze()               — verse→hook contrast tactics
 *   → ProcessingConfig    (feeds audioEngine.renderProcessedAudio)
 *
 * Previously these services produced analysis structs that nothing acted on —
 * this pipeline is the missing actuator layer.
 */

import type { ProcessingConfig, EQSettings, DeEsserConfig, DelayConfig } from '../../types';
import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { VocalIntakeBufferLike, VocalIntakeConditioningReport } from './intakeConditioning';
import type { VocalProfile } from './vocalProfiler';
import type { DeEssingAnalysis } from './deEssingZones';
import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { VocalIntentAnalysis } from './vocalIntentDetector';
import type { AdLibPlacementAnalysis } from './adlibPlacement';
import type { VocalContextAwarenessAnalysis } from './contextAwareness';
import type { HookLiftAnalysis } from './hookLiftLogic';
import type { DelayAutomationAnalysis } from './delayAutomationLogic';
import type { APLPerceptualField } from '../aplPerceptualField';
import { buildAPLPerceptualField } from '../aplPerceptualField';

export interface VocalAnalysisResult {
  /** Raw analysis from each service — useful for UI display */
  conditioning: VocalIntakeConditioningReport;
  profile: VocalProfile;
  deEssing: DeEssingAnalysis;
  compression: CompressionStackAnalysis;
  presence: PresenceAirAnalysis;
  context: VocalContextAwarenessAnalysis | null;
  hookLift: HookLiftAnalysis | null;

  /** Translated DSP config — feed directly to audioEngine.renderProcessedAudio() */
  config: ProcessingConfig;

  /** Human-readable summary of what the pipeline decided */
  summary: string[];
}

export interface VocalAnalysisPipelineContext {
  arrangementAnalysis?: ArrangementAnalysis | null;
  vocalIntentAnalysis?: VocalIntentAnalysis | null;
  delayAutomationAnalysis?: DelayAutomationAnalysis | null;
  contextAwarenessAnalysis?: VocalContextAwarenessAnalysis | null;
  hookLiftAnalysis?: HookLiftAnalysis | null;
  adLibPlacementAnalysis?: AdLibPlacementAnalysis | null;
  perceptualMixField?: APLPerceptualField | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Stub delay analysis — used when running without BPM analysis context */
const NULL_DELAY_ANALYSIS: DelayAutomationAnalysis = {
  shouldApply: false,
  overallConfidence: 0,
  alternateRecommendations: [],
  rationale: 'No delay analysis performed',
  riskNotes: [],
  interactionNotes: [],
  primaryRecommendation: undefined,
};

/**
 * Run all vocal analysis services and produce a unified ProcessingConfig.
 *
 * @param buffer   The vocal AudioBuffer (raw)
 * @param genre    Genre context: affects compression voicing and EQ targets
 */
export async function runVocalAnalysisPipeline(
  buffer: AudioBuffer,
  genre: string = 'hip_hop',
  analysisContext: VocalAnalysisPipelineContext = {},
): Promise<VocalAnalysisResult> {

  // Wrap AudioBuffer in the VocalIntakeBufferLike interface
  const bufferLike: VocalIntakeBufferLike = {
    duration:         buffer.duration,
    length:           buffer.length,
    sampleRate:       buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    getChannelData:   (ch: number) => buffer.getChannelData(ch),
  };

  // ── 1. Intake Conditioning ─────────────────────────────────────────────────
  const { VocalIntakeConditioningService } = await import('./intakeConditioning');
  const { report: conditioning, conditionedBuffer } = VocalIntakeConditioningService.condition(bufferLike);

  // ── 2. Vocal Profiler ──────────────────────────────────────────────────────
  const { VocalProfiler } = await import('./vocalProfiler');
  const profile = VocalProfiler.profile(conditionedBuffer, conditioning);

  // ── 3. De-essing Zone Analysis ─────────────────────────────────────────────
  const { VocalDeEssingZoneDetector } = await import('./deEssingZones');
  const deEssing = VocalDeEssingZoneDetector.analyze(conditionedBuffer, profile, conditioning);

  // ── 4. Compression Stack Logic ─────────────────────────────────────────────
  const { VocalCompressionStackLogic } = await import('./compressionStackLogic');
  const compression = VocalCompressionStackLogic.analyze(profile, conditioning, deEssing);

  // ── 5. Presence + Air Tuning ───────────────────────────────────────────────
  const { VocalPresenceAirTuning } = await import('./presenceAirTuning');
  const presence = VocalPresenceAirTuning.analyze(profile, conditioning, deEssing, compression);

  // ── 6. Context Awareness (optional — no arrangement at this stage) ─────────
  let context: VocalContextAwarenessAnalysis | null = analysisContext.contextAwarenessAnalysis ?? null;
  try {
    if (!context) {
      const { VocalContextAwareness } = await import('./contextAwareness');
      context = VocalContextAwareness.analyze(
        profile,
        compression,
        presence,
        analysisContext.delayAutomationAnalysis ?? NULL_DELAY_ANALYSIS,
        analysisContext.arrangementAnalysis ?? undefined,
        analysisContext.vocalIntentAnalysis ?? undefined,
        analysisContext.hookLiftAnalysis ?? undefined,
        analysisContext.adLibPlacementAnalysis ?? undefined,
      );
    }
  } catch {
    // Context awareness is optional — arrangement data is needed for full accuracy
  }

  // ── 7. Hook Lift Logic (optional) ─────────────────────────────────────────
  let hookLift: HookLiftAnalysis | null = analysisContext.hookLiftAnalysis ?? null;
  try {
    if (!hookLift) {
      const { VocalHookLiftLogic } = await import('./hookLiftLogic');
      hookLift = VocalHookLiftLogic.analyze(
        profile,
        compression,
        presence,
        analysisContext.delayAutomationAnalysis ?? NULL_DELAY_ANALYSIS,
        analysisContext.arrangementAnalysis ?? undefined,
        analysisContext.vocalIntentAnalysis ?? undefined,
        context ?? undefined,
      );
    }
  } catch {
    // Hook lift is optional
  }

  const perceptualField = analysisContext.perceptualMixField
    ?? (context || hookLift || analysisContext.vocalIntentAnalysis || analysisContext.arrangementAnalysis || analysisContext.adLibPlacementAnalysis || analysisContext.delayAutomationAnalysis
      ? buildAPLPerceptualField({
          arrangement: analysisContext.arrangementAnalysis ?? undefined,
          vocalIntent: analysisContext.vocalIntentAnalysis ?? undefined,
          contextAwareness: context ?? undefined,
          hookLift: hookLift ?? undefined,
          adLibPlacement: analysisContext.adLibPlacementAnalysis ?? undefined,
          delayAutomation: analysisContext.delayAutomationAnalysis ?? undefined,
          guardrails: undefined,
        })
      : null);

  // ── Translate analysis structs → unified ProcessingConfig ─────────────────
  const config = _buildProcessingConfig(
    profile, conditioning, deEssing, compression, presence, context, hookLift, genre, analysisContext, perceptualField,
  );

  const summary = _buildSummary(profile, compression, deEssing, presence, context, hookLift, analysisContext, perceptualField);

  return { conditioning, profile, deEssing, compression, presence, context, hookLift, config, summary };
}


// ─── TRANSLATION LAYER ────────────────────────────────────────────────────────

function _buildProcessingConfig(
  profile:     VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  deEssing:    DeEssingAnalysis,
  compression: CompressionStackAnalysis,
  presence:    PresenceAirAnalysis,
  context:     VocalContextAwarenessAnalysis | null,
  hookLift:    HookLiftAnalysis | null,
  genre:       string,
  analysisContext: VocalAnalysisPipelineContext,
  perceptualField: APLPerceptualField | null,
): ProcessingConfig {
  const config: ProcessingConfig = {};

  // Input trim from gain staging
  if (Math.abs(conditioning.gainStaging.gainAppliedDb) > 0.3) {
    config.inputTrimDb = clamp(conditioning.gainStaging.gainAppliedDb, -18, 12);
  }

  // EQ: merge presence targets + mic proximity + hum notch + HP
  config.eq = _buildEQ(profile, conditioning, presence, context, genre);

  // Compression: primary stack first stage
  if (compression.primaryStack.length > 0) {
    const stage1 = compression.primaryStack[0]!;
    config.compression = {
      threshold:  clamp(perceptualField ? stage1.thresholdDb + (perceptualField.restraint - 0.5) * 2.5 : stage1.thresholdDb, -40, -3),
      ratio:      clamp(perceptualField ? stage1.ratio + (perceptualField.punch - 0.5) * 1.4 : stage1.ratio, 1, 20),
      attack:     clamp(stage1.attackMs, 0.1, 100),
      release:    clamp(stage1.releaseMs, 10, 1000),
      makeupGain: clamp(stage1.makeupDb, 0, 12),
    };
  }

  // De-esser: top sibilance zone
  // DeEsserConfig: { frequency, threshold, amount } only
  if (deEssing.shouldApply && deEssing.zones.length > 0) {
    const topZone = deEssing.zones[0]!;
    const rec = topZone.recommendation;
    config.deEsser = {
      frequency: rec.frequency,
      threshold: rec.thresholdDb ?? -14,
      amount:    clamp((rec.gainReduction ?? 6) / 24, 0.1, 1.0),
    };
  }

  // Saturation: warm vocals get light tape saturation
  if (profile.warmth > 0.4) {
    config.saturation = {
      type:   perceptualField?.risk && perceptualField.risk > 0.65 ? 'tape' : perceptualField?.density && perceptualField.density > 0.7 ? 'console' : 'tape',
      amount: clamp(profile.warmth * 0.35 * (perceptualField ? 0.9 + perceptualField.restraint * 0.2 : 1), 0.05, 0.3),
      mix:    clamp(perceptualField ? 0.45 + perceptualField.clarity * 0.12 : 0.5, 0.35, 0.65),
    };
  }

  // Stereo imager: voice type + context adjustment
  // StereoImagerConfig: { lowWidth, midWidth, highWidth, crossovers }
  const widthAmount = _computeWidthAmount(profile, context);
  if (widthAmount !== null) {
    config.stereoImager = {
      lowWidth:   clamp(widthAmount * 0.4, 0.0, 0.8),
      midWidth:   clamp(perceptualField ? widthAmount * (0.8 + perceptualField.width * 0.35) : widthAmount, 0.0, 1.0),
      highWidth:  clamp(widthAmount * 1.2 * (perceptualField ? 0.9 + perceptualField.lift * 0.18 : 1), 0.0, 1.5),
      crossovers: [200, 4000],
    };
  }

  // Reverb: context suggests the vocal needs spatial depth
  // ReverbConfig: { mix, decay, preDelay, motion?, duckingAmount? }
  if (context?.presenceAdjustment.direction === 'deepen') {
    config.motionReverb = {
      mix:      clamp(perceptualField ? 0.06 + perceptualField.depth * 0.05 : 0.08, 0.04, 0.16),
      decay:    clamp(1.2 + context.densityScore * 0.5 + (perceptualField ? perceptualField.depth * 0.35 : 0), 0.8, 2.5),
      preDelay: 15,
    };
  }

  // Delay: honor existing song-context recommendations when available.
  const delayAnalysis = analysisContext.delayAutomationAnalysis;
  const delayRecommendation = delayAnalysis?.primaryRecommendation;
  if (delayAnalysis?.shouldApply && delayRecommendation) {
    const existingDelay: DelayConfig = {
      time: clamp(delayRecommendation.timeMs / 1000, 0.06, 0.75),
      feedback: clamp(perceptualField ? delayRecommendation.feedback * (0.9 + perceptualField.restraint * 0.15) : delayRecommendation.feedback, 0, 0.65),
      mix: clamp(perceptualField ? delayRecommendation.wetLevel * (0.9 + perceptualField.motion * 0.2) : delayRecommendation.wetLevel, 0, 0.35),
    };
    config.delay = existingDelay;
  } else if (analysisContext.adLibPlacementAnalysis?.shouldApply) {
    const adLibMix = analysisContext.adLibPlacementAnalysis.primaryRecommendation?.reverbMix ?? 0;
    if (adLibMix > 0.12 && !config.motionReverb) {
      config.motionReverb = {
        mix: clamp(adLibMix * 0.5, 0.03, 0.12),
        decay: clamp(1.1 + adLibMix * 4, 0.8, 2.0),
        preDelay: 18,
      };
    }
  }

  // Pitch correction: voice-type-confidence drives strength
  if (profile.voiceTypeConfidence > 0.5) {
    config.pitch = {
      enabled:         true,
      mode:            'scale',
      scale:           _genreScale(genre),
      key:             null,
      retuneSpeed:     clamp(40 + profile.breathiness * 30, 20, 80),
      humanize:        clamp(profile.breathiness * 60, 10, 60),
      strength:        clamp(profile.voiceTypeConfidence * 60, 20, 70),
      formantPreserve: true,
    };
  }

  // Hook lift: presence boost on hook sections
  if (hookLift?.shouldApply && hookLift.amountOfLift > 0.2) {
    const presenceTactic = hookLift.tactics.find(t => t.tactic === 'presence');
    if (presenceTactic) {
      const presenceGain = presenceTactic.setting.find(s => s.unit === 'db');
      if (presenceGain && presenceGain.value > 0) {
        config.outputTrimDb = clamp(presenceGain.value * (perceptualField ? 0.28 + perceptualField.lift * 0.22 : 0.4), 0, 3);
      }
    }
  }

  // True-peak limiter: always on
  // TruePeakLimiterConfig: { enabled, ceiling, oversampleFactor? }
  config.truePeakLimiter = {
    enabled:         true,
    ceiling:         -0.3,
    oversampleFactor: 4,
  };

  return config;
}


function _buildEQ(
  profile:      VocalProfile,
  conditioning: VocalIntakeConditioningReport,
  presence:     PresenceAirAnalysis,
  context:      VocalContextAwarenessAnalysis | null,
  genre:        string,
): EQSettings {
  // EQBand type only supports: 'lowshelf' | 'peaking' | 'highshelf'
  // HP → deep low-shelf cut; notch → narrow peaking cut
  const bands: EQSettings = [];

  // 1. Mic proximity correction (proximity effect = bass buildup with close-mic)
  if (conditioning.micProximity.compensationNeeded) {
    const mc = conditioning.micProximity.suggestedEQ;
    bands.push({ frequency: mc.freq, gain: clamp(mc.gain, -12, 0), q: mc.q, type: 'lowshelf' });
  }

  // 2. Hum kill: narrow peaking cut (-20 dB @ 50/60 Hz simulates a notch)
  if (conditioning.noiseSources.hum60Hz) {
    bands.push({ frequency: 60, gain: -20, q: 8, type: 'peaking' });
  } else if (conditioning.noiseSources.hum50Hz) {
    bands.push({ frequency: 50, gain: -20, q: 8, type: 'peaking' });
  }

  // 3. Subsonic rumble cut via low-shelf (approximates high-pass below fundamental)
  //    The custom DSP chain applies its own HP — this shelf shapes the transition
  const hpFreq = profile.fundamentalRange.minHz > 80
    ? Math.max(60, profile.fundamentalRange.minHz * 0.7)
    : 80;
  bands.push({ frequency: hpFreq, gain: -12, q: 0.7, type: 'lowshelf' });

  // 4. Presence EQ from VocalPresenceAirTuning
  for (const target of presence.presenceTargets) {
    if (target.confidence < 0.4) continue;
    let gainDb = target.gainDb;
    if (context?.presenceAdjustment.direction === 'reduce') {
      gainDb *= clamp(1 - context.presenceAdjustment.amount * 0.5, 0.3, 1.0);
    } else if (context?.presenceAdjustment.direction === 'increase') {
      gainDb *= clamp(1 + context.presenceAdjustment.amount * 0.3, 1.0, 1.8);
    }
    bands.push({ frequency: target.targetFrequencyHz, gain: clamp(gainDb, -6, 6), q: target.q, type: 'peaking' });
  }

  // 5. Air shelf from VocalPresenceAirTuning
  for (const target of presence.airTargets) {
    if (target.confidence < 0.45) continue;
    bands.push({ frequency: target.targetFrequencyHz, gain: clamp(target.gainDb, -4, 4), q: target.q, type: 'highshelf' });
  }

  // 6. Genre mud cut (low-mid boxiness)
  const mudFreq: Record<string, number> = {
    hip_hop: 250, trap: 300, pop: 200, rnb: 250, rock: 350,
  };
  const mudCut = mudFreq[genre] ?? 250;
  if (!bands.some(b => b.frequency === mudCut)) {
    bands.push({ frequency: mudCut, gain: -2.0, q: 0.7, type: 'peaking' });
  }

  return bands;
}


function _computeWidthAmount(
  profile: VocalProfile,
  context: VocalContextAwarenessAnalysis | null,
): number | null {
  if (context) {
    const adj = context.presenceAdjustment;
    if (adj.direction === 'narrow') return clamp(0.3 - adj.amount * 0.2, 0.0, 0.5);
    if (adj.direction === 'widen')  return clamp(0.6 + adj.amount * 0.3, 0.5, 1.0);
  }
  const widthByVoice: Record<string, number> = {
    soprano: 0.65, alto: 0.6, tenor: 0.55, baritone: 0.5, bass: 0.4, unknown: 0.55,
  };
  return widthByVoice[profile.voiceType] ?? 0.55;
}


function _genreScale(genre: string): 'major' | 'minor' | 'chromatic' {
  if (['trap', 'rnb', 'hip_hop', 'dark_pop'].includes(genre)) return 'minor';
  if (['pop', 'country', 'gospel', 'indie'].includes(genre)) return 'major';
  return 'chromatic';
}


function _buildSummary(
  profile:     VocalProfile,
  compression: CompressionStackAnalysis,
  deEssing:    DeEssingAnalysis,
  presence:    PresenceAirAnalysis,
  context:     VocalContextAwarenessAnalysis | null,
  hookLift:    HookLiftAnalysis | null,
  analysisContext: VocalAnalysisPipelineContext,
  perceptualField: APLPerceptualField | null,
): string[] {
  const lines: string[] = [];
  const delayAnalysis = analysisContext.delayAutomationAnalysis;
  const delayRecommendation = delayAnalysis?.primaryRecommendation;

  lines.push(
    `Voice: ${profile.voiceType} (${Math.round(profile.voiceTypeConfidence * 100)}% conf) · ` +
    `F0 ${Math.round(profile.fundamentalRange.minHz)}–${Math.round(profile.fundamentalRange.maxHz)} Hz · ` +
    `DR ${profile.dynamicRangeDb.toFixed(1)} dB`
  );

  lines.push(
    `Compression: ${compression.strategy} — ` +
    compression.primaryStack.map(s =>
      `${s.name} (${s.ratio.toFixed(1)}:1 @ ${s.thresholdDb.toFixed(0)} dBFS)`
    ).join(' + ')
  );

  if (deEssing.shouldApply && deEssing.zones.length > 0) {
    const z = deEssing.zones[0]!;
    lines.push(
      `De-ess: ${z.consonants.join('/')} @ ${z.recommendation.frequency} Hz · ` +
      `placement: ${compression.ordering.deEssingPlacement}`
    );
  }

  if (presence.shouldApply && presence.presenceTargets.length > 0) {
    const pts = presence.presenceTargets
      .map(t => `${t.targetFrequencyHz} Hz +${t.gainDb.toFixed(1)} dB`)
      .join(', ');
    lines.push(`Presence: ${pts}`);
  }

  if (perceptualField) {
    lines.push(
      `APL field: clarity ${perceptualField.clarity.toFixed(2)} · density ${perceptualField.density.toFixed(2)} · ` +
      `motion ${perceptualField.motion.toFixed(2)} · width ${perceptualField.width.toFixed(2)}`
    );
    lines.push(
      `Targets: ${perceptualField.targetLufs.toFixed(1)} LUFS · DR ${perceptualField.targetDynamicRange.toFixed(1)} dB · ceiling ${perceptualField.peakCeilingDb.toFixed(1)} dBFS`
    );
  }

  if (delayAnalysis?.shouldApply && delayRecommendation) {
    lines.push(
      `Delay: ${delayRecommendation.useCase} · ${delayRecommendation.tempoDivision} @ ${Math.round(delayRecommendation.timeMs)} ms`
    );
  }

  if (context) {
    lines.push(
      `Context: ${context.densityClass} mix · presence → ${context.presenceAdjustment.direction} · ` +
      `compression → ${context.compressionAdjustment.direction}`
    );
  }

  if (hookLift?.shouldApply) {
    lines.push(
      `Hook lift: ${hookLift.tactics.map(t => t.tactic).join(' + ')} · ` +
      `+${(hookLift.amountOfLift * 100).toFixed(0)}% energy lift target`
    );
  }

  return lines;
}
