/**
 * Stem-Aware Mixing Service
 * Load multiple stems, assign roles, and mix with relative levels
 */

import { audioEngine } from './audioEngine';
import { mixAnalysisService } from './mixAnalysis';
import { referenceAnalyzerV2, AdvancedReferenceAnalysis } from './referenceAnalyzerV2';
import { applySidechainCompression } from './sidechainCompressor';

export type StemRole = 'lead_vocal' | 'background_vocal' | 'adlibs' | 'beat' | 'bass' | 'drums' | 'melody' | 'fx' | 'other';

export interface Stem {
  id: string;
  name: string;
  role: StemRole;
  buffer: AudioBuffer;
  volume: number; // dB
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  // FX sends
  reverbSend: number; // 0-1
  delaySend: number; // 0-1
  // Processing
  eq?: { frequency: number; gain: number; type: BiquadFilterType }[];
  compression?: { threshold: number; ratio: number; attack: number; release: number };
}

export interface StemMixConfig {
  stems: Stem[];
  masterVolume: number;
  referenceAnalysis?: AdvancedReferenceAnalysis;
  mixState?: StemMixState | null;
}

export interface MixdownResult {
  buffer: AudioBuffer;
  peakLevel: number;
  rmsLevel: number;
  clipped: boolean;
}

export type StemMixKey = 'vocals' | 'drums' | 'bass' | 'other';

export interface StemMixStateEntry {
  volume_db: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export type StemMixState = Record<StemMixKey, StemMixStateEntry>;

export function createDefaultStemMixState(): StemMixState {
  return {
    vocals: { volume_db: 0, pan: 0, mute: false, solo: false },
    drums: { volume_db: 0, pan: 0, mute: false, solo: false },
    bass: { volume_db: 0, pan: 0, mute: false, solo: false },
    other: { volume_db: 0, pan: 0, mute: false, solo: false },
  };
}

function normalizeStemMixState(mixState?: Partial<StemMixState> | null): StemMixState {
  const defaults = createDefaultStemMixState();
  if (!mixState) return defaults;
  const entries = Object.entries(defaults) as Array<[StemMixKey, StemMixStateEntry]>;
  for (const [key, fallback] of entries) {
    const source = mixState[key];
    if (!source) continue;
    defaults[key] = {
      volume_db: Number.isFinite(source.volume_db) ? source.volume_db : fallback.volume_db,
      pan: clamp(Number.isFinite(source.pan) ? source.pan : fallback.pan, -1, 1),
      mute: Boolean(source.mute),
      solo: Boolean(source.solo),
    };
  }
  return defaults;
}

function resolveStemMixKey(role: StemRole): StemMixKey {
  if (role === 'beat' || role === 'drums') return 'drums';
  if (role === 'bass') return 'bass';
  if (role === 'lead_vocal' || role === 'background_vocal' || role === 'adlibs') return 'vocals';
  return 'other';
}

function cloneAudioBuffer(source: AudioBuffer, context: BaseAudioContext): AudioBuffer {
  const cloned = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch += 1) {
    cloned.getChannelData(ch).set(source.getChannelData(ch));
  }
  return cloned;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getConstantPowerPanGains(pan: number): { left: number; right: number } {
  const normalized = Math.max(-1, Math.min(1, pan));
  const angle = (normalized + 1) * Math.PI * 0.25;
  return {
    left: Math.cos(angle),
    right: Math.sin(angle),
  };
}

export function shouldApplyBassSidechain(
  stems: Stem[],
  referenceAnalysis?: AdvancedReferenceAnalysis | null
): boolean {
  const triggerStem = stems.find((stem) => stem.role === 'beat' || stem.role === 'drums');
  const bassTargets = stems.filter((stem) => stem.role === 'bass');
  if (!triggerStem || bassTargets.length === 0) return false;
  return Boolean(referenceAnalysis?.sidechain.detected || referenceAnalysis?.overallCharacter.energy === 'aggressive');
}

class StemMixerService {
  private audioContext: AudioContext | null = null;
  private stems: Map<string, Stem> = new Map();

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  /**
   * Add a stem to the mixer
   */
  addStem(name: string, buffer: AudioBuffer, role: StemRole = 'other'): Stem {
    const stem: Stem = {
      id: `stem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      role,
      buffer,
      volume: 0, // Unity gain
      pan: 0, // Center
      muted: false,
      solo: false,
      reverbSend: 0,
      delaySend: 0
    };

    this.stems.set(stem.id, stem);
    return stem;
  }

  /**
   * Remove a stem
   */
  removeStem(id: string): boolean {
    return this.stems.delete(id);
  }

  /**
   * Get all stems
   */
  getStems(): Stem[] {
    return Array.from(this.stems.values());
  }

  /**
   * Update stem settings
   */
  updateStem(id: string, updates: Partial<Stem>): Stem | null {
    const stem = this.stems.get(id);
    if (!stem) return null;

    const updated = { ...stem, ...updates };
    this.stems.set(id, updated);
    return updated;
  }

  /**
   * Apply a 4-stem console mix state to the loaded stems.
   *
   * This bridges the UI-facing mixer state into the actual mixdown engine and
   * keeps mute / solo / pan / gain semantics deterministic.
   */
  applyMixState(mixState?: Partial<StemMixState> | null): Stem[] {
    const resolved = normalizeStemMixState(mixState);
    const soloGroups = new Set<StemMixKey>(
      (Object.entries(resolved) as Array<[StemMixKey, StemMixStateEntry]>)
        .filter(([, entry]) => entry.solo)
        .map(([key]) => key)
    );
    const hasSolo = soloGroups.size > 0;

    const updated: Stem[] = [];
    for (const [id, stem] of this.stems) {
      const key = resolveStemMixKey(stem.role);
      const entry = resolved[key];
      const shouldSolo = hasSolo ? soloGroups.has(key) : entry.solo;
      const shouldMute = hasSolo ? !shouldSolo : entry.mute;

      const nextStem: Stem = {
        ...stem,
        volume: entry.volume_db,
        pan: entry.pan,
        muted: shouldMute,
        solo: shouldSolo,
      };
      this.stems.set(id, nextStem);
      updated.push(nextStem);
    }

    return updated;
  }

  /**
   * Auto-detect stem role based on frequency content
   */
  async detectStemRole(buffer: AudioBuffer): Promise<StemRole> {
    const metrics = mixAnalysisService.analyzeStaticMetrics(buffer);

    // Analyze frequency balance
    const signature = await mixAnalysisService.extractMixSignature(buffer);

    const lowRatio = signature.tonalBalance.low;
    const midRatio = signature.tonalBalance.mid + signature.tonalBalance.lowMid;
    const highRatio = signature.tonalBalance.high + signature.tonalBalance.highMid;

    // Bass-heavy = bass or drums
    if (lowRatio > 0.4 && midRatio < 0.3) {
      return signature.dynamics.crestFactor > 10 ? 'drums' : 'bass';
    }

    // Mid-focused = likely vocals
    if (midRatio > 0.4 && signature.stereoWidth.mid < 0.5) {
      return 'lead_vocal';
    }

    // Wide mids = background vocals or pads
    if (midRatio > 0.3 && signature.stereoWidth.mid > 0.6) {
      return 'background_vocal';
    }

    // High-heavy = hats/cymbals or fx
    if (highRatio > 0.35) {
      return metrics.crestFactor > 8 ? 'fx' : 'melody';
    }

    // Balanced = melody or beat
    if (lowRatio > 0.15 && highRatio > 0.15) {
      return 'beat';
    }

    return 'other';
  }

  /**
   * Suggest mix levels based on reference analysis
   */
  suggestMixLevels(referenceAnalysis: AdvancedReferenceAnalysis): Map<StemRole, { volume: number; pan: number; reverbSend: number; delaySend: number }> {
    const suggestions = new Map<StemRole, { volume: number; pan: number; reverbSend: number; delaySend: number }>();

    // Lead vocal - upfront based on reference vocal position
    suggestions.set('lead_vocal', {
      volume: referenceAnalysis.vocalPosition.forwardness > 0.7 ? 0 : -1.5,
      pan: 0,
      reverbSend: referenceAnalysis.vocalPosition.wetDryRatio * 0.5,
      delaySend: referenceAnalysis.delay.detected ? referenceAnalysis.delay.wetDryRatio * 0.3 : 0
    });

    // Background vocals - wider and more reverb
    suggestions.set('background_vocal', {
      volume: -4,
      pan: 0,
      reverbSend: Math.min(referenceAnalysis.reverb.wetDryRatio * 1.5, 0.6),
      delaySend: referenceAnalysis.delay.detected ? referenceAnalysis.delay.wetDryRatio * 0.5 : 0.1
    });

    // Adlibs - panned and effected
    suggestions.set('adlibs', {
      volume: -6,
      pan: 0.3,
      reverbSend: referenceAnalysis.reverb.wetDryRatio * 0.8,
      delaySend: referenceAnalysis.delay.detected ? 0.4 : 0.2
    });

    // Beat - foundation level
    suggestions.set('beat', {
      volume: referenceAnalysis.sidechain.detected ? 0 : -1,
      pan: 0,
      reverbSend: 0.05,
      delaySend: 0
    });

    // Bass - solid low end
    suggestions.set('bass', {
      volume: referenceAnalysis.overallCharacter.energy === 'aggressive' ? 1 : 0,
      pan: 0,
      reverbSend: 0,
      delaySend: 0
    });

    // Drums - punchy
    suggestions.set('drums', {
      volume: referenceAnalysis.overallCharacter.energy === 'aggressive' ? 0.5 : -0.5,
      pan: 0,
      reverbSend: referenceAnalysis.reverb.character === 'room' ? 0.15 : 0.05,
      delaySend: 0
    });

    // Melody - sits behind vocal
    suggestions.set('melody', {
      volume: -3,
      pan: 0,
      reverbSend: referenceAnalysis.reverb.wetDryRatio * 0.6,
      delaySend: referenceAnalysis.delay.wetDryRatio * 0.4
    });

    // FX - atmospheric
    suggestions.set('fx', {
      volume: -6,
      pan: 0,
      reverbSend: 0.5,
      delaySend: 0.3
    });

    suggestions.set('other', {
      volume: -3,
      pan: 0,
      reverbSend: 0.1,
      delaySend: 0.05
    });

    return suggestions;
  }

  /**
   * Apply reference-based mix settings to all stems
   */
  async applyReferenceMix(referenceBuffer: AudioBuffer): Promise<void> {
    const analysis = await referenceAnalyzerV2.analyzeReference(referenceBuffer);
    const suggestions = this.suggestMixLevels(analysis);

    for (const [id, stem] of this.stems) {
      const suggestion = suggestions.get(stem.role);
      if (suggestion) {
        this.updateStem(id, {
          volume: suggestion.volume,
          pan: suggestion.pan,
          reverbSend: suggestion.reverbSend,
          delaySend: suggestion.delaySend
        });
      }
    }
  }

  /**
   * Render all stems to a single mixdown
   */
  async renderMixdown(config?: {
    reverbDecay?: number;
    reverbMix?: number;
    delayTimeMs?: number;
    delayFeedback?: number;
    referenceAnalysis?: AdvancedReferenceAnalysis | null;
    mixState?: StemMixState | null;
  }): Promise<MixdownResult> {
    if (config?.mixState) {
      this.applyMixState(config.mixState);
    }

    const stems = this.getStems().filter(s => !s.muted);
    const hasSolo = stems.some(s => s.solo);
    const activeStems = hasSolo ? stems.filter(s => s.solo) : stems;

    if (activeStems.length === 0) {
      throw new Error('No active stems to mix');
    }

    // Find the longest stem
    const maxLength = Math.max(...activeStems.map(s => s.buffer.length));
    const sampleRate = activeStems[0].buffer.sampleRate;
    const numChannels = 2; // Always output stereo

    const ctx = this.getContext();
    const offlineCtx = new OfflineAudioContext(numChannels, maxLength, sampleRate);

    // Create master bus
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(offlineCtx.destination);

    const renderStems = activeStems.map((stem) => ({
      ...stem,
      buffer: cloneAudioBuffer(stem.buffer, offlineCtx),
    }));

    const referenceAnalysis = config?.referenceAnalysis;
    if (shouldApplyBassSidechain(renderStems, referenceAnalysis)) {
      const triggerStem = renderStems.find((stem) => stem.role === 'beat' || stem.role === 'drums');
      const bassTargets = renderStems.filter((stem) => stem.role === 'bass');
      if (!triggerStem) {
        // Defensive guard, should not happen after the routing predicate.
        throw new Error('Bass sidechain routing selected without a trigger stem');
      }
      for (const bassStem of bassTargets) {
        applySidechainCompression(bassStem.buffer, triggerStem.buffer, {
          threshold: referenceAnalysis?.sidechain.amount ? -18 - Math.min(6, referenceAnalysis.sidechain.amount) : -20,
          ratio: referenceAnalysis?.sidechain.pumpFactor && referenceAnalysis.sidechain.pumpFactor > 0.5 ? 5 : 3.5,
          knee: 4,
          attackMs: 6,
          releaseMs: referenceAnalysis?.sidechain.releaseMs ?? 160,
          lookaheadMs: 3,
          mix: 0.7,
        });
      }
    }

    // Create reverb send bus (simple convolution approximation)
    const reverbGain = offlineCtx.createGain();
    reverbGain.gain.value = config?.reverbMix ?? 0.3;

    // Simple reverb using delay network
    const reverbDelay1 = offlineCtx.createDelay(1);
    reverbDelay1.delayTime.value = 0.03;
    const reverbDelay2 = offlineCtx.createDelay(1);
    reverbDelay2.delayTime.value = 0.05;
    const reverbFeedback = offlineCtx.createGain();
    reverbFeedback.gain.value = config?.reverbDecay ?? 0.4;

    reverbGain.connect(reverbDelay1);
    reverbDelay1.connect(reverbDelay2);
    reverbDelay2.connect(reverbFeedback);
    reverbFeedback.connect(reverbDelay1);
    reverbDelay2.connect(masterGain);

    // Create delay send bus
    const delayGain = offlineCtx.createGain();
    delayGain.gain.value = 0.3;
    const delayNode = offlineCtx.createDelay(2);
    delayNode.delayTime.value = (config?.delayTimeMs ?? 250) / 1000;
    const delayFeedback = offlineCtx.createGain();
    delayFeedback.gain.value = config?.delayFeedback ?? 0.3;

    delayGain.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(masterGain);

    // Process each stem
    for (const stem of renderStems) {
      const source = offlineCtx.createBufferSource();
      source.buffer = stem.buffer;

      // Volume
      const volumeGain = offlineCtx.createGain();
      volumeGain.gain.value = Math.pow(10, stem.volume / 20); // dB to linear

      // Pan
      const { left, right } = getConstantPowerPanGains(stem.pan);
      const splitter = offlineCtx.createChannelSplitter(2);
      const merger = offlineCtx.createChannelMerger(2);
      const leftGain = offlineCtx.createGain();
      const rightGain = offlineCtx.createGain();
      leftGain.gain.value = left;
      rightGain.gain.value = right;

      // Connect chain
      source.connect(volumeGain);
      volumeGain.connect(splitter);
      splitter.connect(leftGain, 0);
      splitter.connect(rightGain, 1);
      leftGain.connect(merger, 0, 0);
      rightGain.connect(merger, 0, 1);
      merger.connect(masterGain);

      // Send to reverb
      if (stem.reverbSend > 0) {
        const reverbSendGain = offlineCtx.createGain();
        reverbSendGain.gain.value = stem.reverbSend;
        source.connect(reverbSendGain);
        reverbSendGain.connect(reverbGain);
      }

      // Send to delay
      if (stem.delaySend > 0) {
        const delaySendGain = offlineCtx.createGain();
        delaySendGain.gain.value = stem.delaySend;
        source.connect(delaySendGain);
        delaySendGain.connect(delayGain);
      }

      source.start(0);
    }

    // Render
    const mixedBuffer = await offlineCtx.startRendering();

    // Analyze result
    let peakLevel = 0;
    let rmsSum = 0;
    let clipped = false;

    for (let ch = 0; ch < mixedBuffer.numberOfChannels; ch++) {
      const data = mixedBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peakLevel) peakLevel = abs;
        if (abs > 1) clipped = true;
        rmsSum += data[i] * data[i];
      }
    }

    const rmsLevel = Math.sqrt(rmsSum / (mixedBuffer.length * mixedBuffer.numberOfChannels));

    return {
      buffer: mixedBuffer,
      peakLevel,
      rmsLevel,
      clipped
    };
  }

  /**
   * Clear all stems
   */
  clear(): void {
    this.stems.clear();
  }

  /**
   * Get stem count
   */
  get stemCount(): number {
    return this.stems.size;
  }
}

export const stemMixerService = new StemMixerService();
