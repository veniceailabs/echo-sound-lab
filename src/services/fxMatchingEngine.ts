/**
 * FX Matching Engine
 * "Make my vocals sound like THIS reference" by approximating the processing chain
 */

import { ProcessingConfig } from '../types';
import { referenceAnalyzerV2, AdvancedReferenceAnalysis, ReverbAnalysis, DelayAnalysis, VocalPositionAnalysis, SidechainAnalysis } from './referenceAnalyzerV2';
import { mixAnalysisService } from './mixAnalysis';

export interface FXMatchResult {
  suggestedConfig: ProcessingConfig;
  reverbConfig: {
    type: ReverbAnalysis['character'];
    decay: number;
    preDelay: number;
    mix: number;
    brightness: ReverbAnalysis['brightness'];
  };
  delayConfig: {
    timeMs: number;
    timeBPM: number | null;
    feedback: number;
    mix: number;
    type: DelayAnalysis['type'];
    stereo: boolean;
  };
  vocalConfig: {
    presenceBoost: number; // dB at presence freq
    airBoost: number; // dB at air freq
    compressionRatio: number;
    deEsserAmount: number;
  };
  sidechainConfig: {
    enabled: boolean;
    amount: number;
    attack: number;
    release: number;
  };
  matchConfidence: number; // 0-100
  explanations: string[];
}

class FXMatchingEngine {
  /**
   * Analyze a reference track and generate FX settings to match it
   */
  async matchReference(referenceBuffer: AudioBuffer): Promise<FXMatchResult> {
    const analysis = await referenceAnalyzerV2.analyzeReference(referenceBuffer);
    const explanations: string[] = [];

    // Generate reverb config
    const reverbConfig = this.generateReverbConfig(analysis.reverb, explanations);

    // Generate delay config
    const delayConfig = this.generateDelayConfig(analysis.delay, analysis.estimatedBPM, explanations);

    // Generate vocal processing config
    const vocalConfig = this.generateVocalConfig(analysis.vocalPosition, explanations);

    // Generate sidechain config
    const sidechainConfig = this.generateSidechainConfig(analysis.sidechain, explanations);

    // Apply genre-aware adjustments before building final config
    this.applyGenreAwareAdjustments(analysis, reverbConfig, delayConfig, vocalConfig, explanations);

    // Build the processing config
    const suggestedConfig = this.buildProcessingConfig(analysis, reverbConfig, delayConfig, vocalConfig);

    // Calculate match confidence
    const matchConfidence = this.calculateConfidence(analysis);

    return {
      suggestedConfig,
      reverbConfig,
      delayConfig,
      vocalConfig,
      sidechainConfig,
      matchConfidence,
      explanations
    };
  }

  /**
   * Match FX from reference to a target buffer
   * Returns processing config optimized for the target
   */
  async matchFXToTarget(
    referenceBuffer: AudioBuffer,
    targetBuffer: AudioBuffer
  ): Promise<FXMatchResult & { targetAdjustments: string[] }> {
    const result = await this.matchReference(referenceBuffer);

    // Analyze target to see what adjustments are needed
    const targetSignature = await mixAnalysisService.extractMixSignature(targetBuffer);
    const targetAdjustments: string[] = [];

    // Compare target characteristics to reference FX requirements
    if (result.vocalConfig.presenceBoost > 3 && targetSignature.tonalBalance.highMid > 0.25) {
      targetAdjustments.push('Target already has good presence - reducing boost');
      result.vocalConfig.presenceBoost *= 0.5;
      result.suggestedConfig.eq = result.suggestedConfig.eq?.map(band =>
        band.frequency > 2000 && band.frequency < 5000
          ? { ...band, gain: band.gain * 0.5 }
          : band
      );
    }

    if (result.reverbConfig.mix > 0.3 && targetSignature.character.brightness > 0.7) {
      targetAdjustments.push('Target is bright - using darker reverb setting');
      result.reverbConfig.brightness = 'dark';
    }

    // Adjust for different dynamics
    const targetDynamics = targetSignature.dynamics.crestFactor;
    if (targetDynamics < 6) {
      targetAdjustments.push('Target is heavily compressed - reducing additional compression');
      if (result.suggestedConfig.compression) {
        result.suggestedConfig.compression.ratio = Math.max(1.5, result.suggestedConfig.compression.ratio * 0.7);
      }
    }

    return {
      ...result,
      targetAdjustments
    };
  }

  /**
   * Apply genre-aware adjustments to FX matching
   * Different genres have different conventions for vocal treatment
   */
  private applyGenreAwareAdjustments(
    analysis: AdvancedReferenceAnalysis,
    reverbConfig: FXMatchResult['reverbConfig'],
    delayConfig: FXMatchResult['delayConfig'],
    vocalConfig: FXMatchResult['vocalConfig'],
    explanations: string[]
  ): void {
    const production = analysis.overallCharacter.production;
    const energy = analysis.overallCharacter.energy;

    // Hip-Hop/Trap adjustments - typically dry, upfront vocals with tight delay
    if (production === 'polished' && energy === 'aggressive') {
      if (reverbConfig.mix > 0.2) {
        reverbConfig.mix *= 0.7; // Reduce reverb for hip-hop style
        explanations.push('Hip-Hop/Trap style detected - keeping vocals drier and more upfront');
      }
      if (vocalConfig.presenceBoost < 2.5) {
        vocalConfig.presenceBoost += 0.5; // Add presence for clarity
      }
      if (delayConfig.mix > 0 && delayConfig.type === 'slapback') {
        explanations.push('Slapback delay fits hip-hop aesthetic - keeping tight timing');
      }
    }

    // R&B/Soul adjustments - lush reverb, smooth compression, air
    if (production === 'polished' && energy === 'moderate') {
      if (vocalConfig.airBoost < 2) {
        vocalConfig.airBoost += 1; // Add air for R&B smoothness
        explanations.push('R&B/Soul style detected - adding high-end air for silky vocals');
      }
      if (reverbConfig.type === 'plate' || reverbConfig.type === 'hall') {
        explanations.push('Lush reverb fits R&B aesthetic - preserving spacious vocal treatment');
      }
    }

    // Rock/Indie adjustments - raw character, natural dynamics, room reverb
    if (production === 'raw') {
      if (vocalConfig.compressionRatio > 3) {
        vocalConfig.compressionRatio = Math.max(2.5, vocalConfig.compressionRatio * 0.85);
        explanations.push('Raw/Indie style detected - reducing compression to preserve natural dynamics');
      }
      if (reverbConfig.type === 'ambient') {
        reverbConfig.type = 'room'; // Prefer room for rock
        explanations.push('Switching to room reverb for more natural rock vocal sound');
      }
    }

    // Electronic/Pop adjustments - polished, bright, heavily processed
    if (production === 'polished' && vocalConfig.airBoost > 2) {
      if (vocalConfig.deEsserAmount === 0) {
        vocalConfig.deEsserAmount = 0.3; // Add de-esser for bright pop vocals
        explanations.push('Electronic/Pop style with bright vocals - adding de-esser');
      }
      if (delayConfig.mix > 0 && delayConfig.type === 'dotted') {
        explanations.push('Dotted delay fits electronic/pop aesthetic - creating rhythmic bounce');
      }
    }

    // Ambient/Atmospheric adjustments - heavy reverb and delay
    if (energy === 'relaxed' && (reverbConfig.decay > 3 || delayConfig.mix > 0.3)) {
      explanations.push('Ambient/Atmospheric style detected - embracing spacious, dreamy vocal treatment');
      if (reverbConfig.brightness !== 'dark') {
        reverbConfig.brightness = 'dark'; // Dark reverb for ambient
      }
    }

    // Aggressive/EDM adjustments - heavy sidechain, compression
    if (energy === 'aggressive' && analysis.sidechain.detected) {
      explanations.push('EDM/Aggressive style with sidechain pumping - creating rhythmic energy');
      if (vocalConfig.compressionRatio < 3.5) {
        vocalConfig.compressionRatio += 0.5; // Increase compression for consistent energy
      }
    }
  }

  private generateReverbConfig(
    reverb: ReverbAnalysis,
    explanations: string[]
  ): FXMatchResult['reverbConfig'] {
    if (!reverb.detected) {
      explanations.push('No significant reverb detected - keeping vocals dry');
      return {
        type: 'room',
        decay: 0.3,
        preDelay: 10,
        mix: 0.05,
        brightness: 'neutral'
      };
    }

    // Improved decay time calibration
    let calibratedDecay = reverb.decayTime;
    if (reverb.decayTime > 4) {
      calibratedDecay = Math.min(reverb.decayTime * 0.8, 5); // Cap extreme decays
      explanations.push(`Long reverb tail detected (${reverb.decayTime.toFixed(1)}s) - calibrating to ${calibratedDecay.toFixed(1)}s for clarity`);
    } else if (reverb.decayTime < 0.5) {
      calibratedDecay = Math.max(reverb.decayTime * 1.2, 0.3); // Boost very short decays
      explanations.push(`Short reverb tail detected - adjusted for natural room character`);
    }

    // Improved mix calibration
    let calibratedMix = reverb.wetDryRatio;
    if (reverb.wetDryRatio > 0.5) {
      calibratedMix = 0.3 + (reverb.wetDryRatio - 0.5) * 0.4; // Compress excessive wet signals
      explanations.push(`Heavy reverb detected - calibrating mix to ${Math.round(calibratedMix * 100)}% for balance`);
    }

    let typeExplanation = '';
    switch (reverb.character) {
      case 'room':
        typeExplanation = 'Small room reverb detected - intimate sound';
        break;
      case 'plate':
        typeExplanation = 'Plate-style reverb detected - classic vocal sound';
        break;
      case 'hall':
        typeExplanation = 'Hall reverb detected - spacious atmosphere';
        break;
      case 'ambient':
        typeExplanation = 'Long ambient reverb detected - atmospheric/dreamy';
        break;
      default:
        typeExplanation = 'Reverb characteristics detected';
    }
    explanations.push(typeExplanation);

    if (reverb.preDelay > 30) {
      explanations.push(`Pre-delay of ~${Math.round(reverb.preDelay)}ms keeps vocal upfront in the reverb`);
    }

    return {
      type: reverb.character,
      decay: calibratedDecay,
      preDelay: reverb.preDelay,
      mix: calibratedMix,
      brightness: reverb.brightness
    };
  }

  private generateDelayConfig(
    delay: DelayAnalysis,
    bpm: number,
    explanations: string[]
  ): FXMatchResult['delayConfig'] {
    if (!delay.detected) {
      explanations.push('No significant delay detected');
      return {
        timeMs: 0,
        timeBPM: null,
        feedback: 0,
        mix: 0,
        type: 'unknown',
        stereo: false
      };
    }

    // Improved delay timing calibration - snap to musical values when close
    let calibratedTimeMs = delay.delayTimeMs;
    let calibratedTimeBPM = delay.delayTimeBPM;

    if (bpm > 0 && delay.type !== 'slapback') {
      const quarterNote = 60000 / bpm;
      const eighthNote = quarterNote / 2;
      const dottedEighth = eighthNote * 1.5;

      // Check if delay time is close to musical values and snap
      const tolerance = 20; // ms
      if (Math.abs(delay.delayTimeMs - quarterNote) < tolerance) {
        calibratedTimeMs = quarterNote;
        calibratedTimeBPM = bpm;
        explanations.push(`Delay time adjusted to exact quarter note at ${bpm} BPM`);
      } else if (Math.abs(delay.delayTimeMs - eighthNote) < tolerance) {
        calibratedTimeMs = eighthNote;
        calibratedTimeBPM = bpm / 2;
        explanations.push(`Delay time adjusted to exact eighth note at ${bpm} BPM`);
      } else if (Math.abs(delay.delayTimeMs - dottedEighth) < tolerance) {
        calibratedTimeMs = dottedEighth;
        calibratedTimeBPM = bpm * 0.75;
        explanations.push(`Delay time adjusted to exact dotted eighth at ${bpm} BPM`);
      }
    }

    // Improved feedback calibration to prevent excessive repeats
    let calibratedFeedback = delay.feedback;
    if (delay.feedback > 0.7) {
      calibratedFeedback = 0.5 + (delay.feedback - 0.7) * 0.5; // Compress high feedback
      explanations.push(`Heavy feedback detected - calibrating to ${Math.round(calibratedFeedback * 100)}% to prevent muddiness`);
    } else if (delay.feedback < 0.1 && delay.type !== 'slapback') {
      calibratedFeedback = Math.max(delay.feedback, 0.15); // Boost very low feedback for audibility
      explanations.push(`Low feedback increased slightly for audible delay tail`);
    }

    // Improved mix calibration similar to reverb
    let calibratedMix = delay.wetDryRatio;
    if (delay.wetDryRatio > 0.4) {
      calibratedMix = 0.25 + (delay.wetDryRatio - 0.4) * 0.3; // Compress excessive delay mix
      explanations.push(`Heavy delay mix detected - calibrating to ${Math.round(calibratedMix * 100)}% for clarity`);
    }

    let typeExplanation = '';
    switch (delay.type) {
      case 'slapback':
        typeExplanation = `Slapback delay detected (~${Math.round(calibratedTimeMs)}ms) - classic doubling effect`;
        break;
      case 'quarter':
        typeExplanation = `Quarter-note delay synced to ${bpm} BPM`;
        break;
      case 'eighth':
        typeExplanation = `Eighth-note delay synced to ${bpm} BPM`;
        break;
      case 'dotted':
        typeExplanation = `Dotted eighth delay synced to ${bpm} BPM - creates rhythmic bounce`;
        break;
      case 'long':
        typeExplanation = `Long delay (~${Math.round(calibratedTimeMs)}ms) - ambient/atmospheric`;
        break;
      default:
        typeExplanation = `Delay detected at ${Math.round(calibratedTimeMs)}ms`;
    }
    explanations.push(typeExplanation);

    if (delay.stereoSpread > 0.5) {
      explanations.push('Stereo/ping-pong delay detected - creates width');
    }

    return {
      timeMs: calibratedTimeMs,
      timeBPM: calibratedTimeBPM,
      feedback: calibratedFeedback,
      mix: calibratedMix,
      type: delay.type,
      stereo: delay.stereoSpread > 0.4
    };
  }

  private generateVocalConfig(
    vocalPosition: VocalPositionAnalysis,
    explanations: string[]
  ): FXMatchResult['vocalConfig'] {
    let presenceBoost = 0;
    let airBoost = 0;
    let compressionRatio = 2;
    let deEsserAmount = 0;

    // Improved presence detection with genre awareness
    if (vocalPosition.forwardness > 0.75) {
      presenceBoost = 4;
      explanations.push('Vocal very upfront - aggressive presence boost at 3kHz for clarity');
    } else if (vocalPosition.forwardness > 0.6) {
      presenceBoost = 3;
      explanations.push('Vocal is forward - moderate presence boost');
    } else if (vocalPosition.forwardness > 0.35) {
      presenceBoost = 1.5;
      explanations.push('Balanced vocal presence');
    } else {
      presenceBoost = 0.5;
      explanations.push('Laid-back vocal - minimal presence to preserve naturalness');
    }

    // Improved air detection with calibration
    if (vocalPosition.airAmount > 0.5) {
      airBoost = Math.min(vocalPosition.airAmount * 7, 5); // Cap at +5dB
      explanations.push(`Significant high-end air detected - adding ${airBoost.toFixed(1)}dB shelf at 10kHz+`);
    } else if (vocalPosition.airAmount > 0.25) {
      airBoost = vocalPosition.airAmount * 5;
      explanations.push(`Moderate air - subtle high shelf boost`);
    }

    // Estimate compression from how "controlled" the vocal sounds
    if (vocalPosition.forwardness > 0.6 && vocalPosition.wetDryRatio < 0.3) {
      compressionRatio = 4;
      explanations.push('Tight vocal compression detected (4:1 ratio)');
    } else if (vocalPosition.forwardness > 0.4) {
      compressionRatio = 3;
      explanations.push('Moderate vocal compression (3:1 ratio)');
    } else {
      compressionRatio = 2;
      explanations.push('Light vocal compression (2:1 ratio)');
    }

    // Bright vocals often need de-essing
    if (airBoost > 2) {
      deEsserAmount = 0.4;
      explanations.push('De-esser recommended to control sibilance with bright settings');
    }

    return {
      presenceBoost,
      airBoost,
      compressionRatio,
      deEsserAmount
    };
  }

  private generateSidechainConfig(
    sidechain: SidechainAnalysis,
    explanations: string[]
  ): FXMatchResult['sidechainConfig'] {
    if (!sidechain.detected) {
      explanations.push('No sidechain pumping detected');
      return {
        enabled: false,
        amount: 0,
        attack: 5,
        release: 100
      };
    }

    explanations.push(`Sidechain compression detected - ${sidechain.amount.toFixed(1)}dB of ducking`);

    if (sidechain.pumpFactor > 0.5) {
      explanations.push('Heavy pumping effect - creates rhythmic energy');
    }

    return {
      enabled: true,
      amount: sidechain.amount,
      attack: sidechain.attackMs,
      release: sidechain.releaseMs
    };
  }

  private buildProcessingConfig(
    analysis: AdvancedReferenceAnalysis,
    reverbConfig: FXMatchResult['reverbConfig'],
    delayConfig: FXMatchResult['delayConfig'],
    vocalConfig: FXMatchResult['vocalConfig']
  ): ProcessingConfig {
    const config: ProcessingConfig = {};

    // EQ for vocal presence and air
    const eqBands: ProcessingConfig['eq'] = [];

    if (vocalConfig.presenceBoost > 0) {
      eqBands.push({
        frequency: 3000,
        gain: vocalConfig.presenceBoost,
        type: 'peaking',
        q: 1.5
      });
    }

    if (vocalConfig.airBoost > 0) {
      eqBands.push({
        frequency: 10000,
        gain: vocalConfig.airBoost,
        type: 'highshelf'
      });
    }

    // Add low cut if vocal is meant to be clean
    if (analysis.vocalPosition.forwardness > 0.5) {
      eqBands.push({
        frequency: 80,
        gain: -12,
        type: 'highpass' as any
      });
    }

    if (eqBands.length > 0) {
      config.eq = eqBands;
    }

    // Improved adaptive compression curve matching
    let threshold = -18;
    let attack = 0.01;
    let release = 0.15;

    // Adjust threshold based on vocal forwardness
    if (analysis.vocalPosition.forwardness > 0.7) {
      threshold = -24; // Lower threshold for very upfront vocals to catch transients
    } else if (analysis.vocalPosition.forwardness < 0.4) {
      threshold = -12; // Higher threshold for laid-back vocals to preserve dynamics
    }

    // Adjust attack based on compression ratio and vocal character
    if (vocalConfig.compressionRatio >= 4) {
      attack = 0.005; // Fast attack for heavy compression to control peaks
    } else if (vocalConfig.compressionRatio <= 2) {
      attack = 0.020; // Slower attack for light compression to preserve transients
    }

    // Adjust release based on vocal wetness/reverb
    if (analysis.reverb.detected && analysis.reverb.wetDryRatio > 0.3) {
      release = 0.25; // Longer release for reverby vocals to avoid pumping
    } else if (analysis.vocalPosition.forwardness > 0.6) {
      release = 0.10; // Shorter release for dry, upfront vocals
    }

    // Adaptive makeup gain calculation
    const adaptiveMakeupGain = vocalConfig.compressionRatio > 3.5 ? 4 :
                                vocalConfig.compressionRatio > 2.5 ? 3 :
                                vocalConfig.compressionRatio > 1.5 ? 2 : 1;

    config.compression = {
      threshold,
      ratio: vocalConfig.compressionRatio,
      attack,
      release,
      makeupGain: adaptiveMakeupGain
    };

    // De-esser
    if (vocalConfig.deEsserAmount > 0) {
      config.deEsser = {
        frequency: 6500,
        threshold: -25,
        amount: vocalConfig.deEsserAmount
      };
    }

    // Reverb (mapped to motionReverb)
    if (reverbConfig.mix > 0.05) {
      config.motionReverb = {
        mix: reverbConfig.mix,
        decay: reverbConfig.decay,
        preDelay: reverbConfig.preDelay / 1000, // Convert ms to seconds
        duckingAmount: analysis.sidechain.detected ? 0.3 : 0
      };
    }

    // Saturation for warmth
    if (analysis.overallCharacter.production !== 'raw') {
      config.saturation = {
        type: reverbConfig.brightness === 'dark' ? 'tape' : 'tube',
        amount: 0.1,
        mix: 0.5
      };
    }

    // Limiter for loud references
    if (analysis.overallCharacter.energy === 'aggressive') {
      config.limiter = {
        threshold: -1,
        ratio: 20,
        release: 0.05
      };
    }

    return config;
  }

  private calculateConfidence(analysis: AdvancedReferenceAnalysis): number {
    let confidence = 50; // Base confidence

    // Increase confidence for clear detections
    if (analysis.reverb.detected && analysis.reverb.wetDryRatio > 0.1) confidence += 10;
    if (analysis.delay.detected && analysis.delay.type !== 'unknown') confidence += 10;
    if (analysis.vocalPosition.detected) confidence += 10;
    if (analysis.sidechain.detected) confidence += 5;
    if (analysis.estimatedBPM > 0) confidence += 5;

    // Decrease for ambiguous results
    if (analysis.reverb.character === 'unknown') confidence -= 5;
    if (analysis.delay.type === 'unknown' && analysis.delay.detected) confidence -= 5;

    // Cap at 95 (never claim 100% certainty)
    return Math.min(Math.max(confidence, 20), 95);
  }

  /**
   * Generate a human-readable summary of the FX match
   */
  generateSummary(result: FXMatchResult): string {
    const lines: string[] = [];

    lines.push(`FX Match Confidence: ${result.matchConfidence}%`);
    lines.push('');

    if (result.reverbConfig.mix > 0.05) {
      lines.push(`REVERB: ${result.reverbConfig.type} style, ${result.reverbConfig.decay.toFixed(1)}s decay, ${Math.round(result.reverbConfig.mix * 100)}% wet`);
    } else {
      lines.push('REVERB: Dry/minimal');
    }

    if (result.delayConfig.mix > 0) {
      const syncInfo = result.delayConfig.timeBPM
        ? ` (synced to ${result.delayConfig.timeBPM} BPM)`
        : '';
      lines.push(`DELAY: ${result.delayConfig.type}, ${result.delayConfig.timeMs}ms${syncInfo}`);
    } else {
      lines.push('DELAY: None detected');
    }

    lines.push(`VOCAL: Presence +${result.vocalConfig.presenceBoost.toFixed(1)}dB, Air +${result.vocalConfig.airBoost.toFixed(1)}dB`);
    lines.push(`COMPRESSION: ${result.vocalConfig.compressionRatio}:1 ratio`);

    if (result.sidechainConfig.enabled) {
      lines.push(`SIDECHAIN: ${result.sidechainConfig.amount.toFixed(1)}dB ducking`);
    }

    return lines.join('\n');
  }
}

export const fxMatchingEngine = new FXMatchingEngine();