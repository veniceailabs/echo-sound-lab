/**
 * STEM PLAYBACK SERVICE
 *
 * Sprint 2B: The Mix
 * Enhanced Web Audio API wrapper for multi-stem synchronized playback
 *
 * Core Responsibilities:
 * 1. Manage 4 synchronized AudioBuffers (vocals, drums, bass, other)
 * 2. Implement mixer graph with per-stem GainNodes
 * 3. Handle play/pause/seek across all stems simultaneously
 * 4. Track and broadcast currentTime to visualizations
 * 5. Expose AnalyserNode for FFT data capture
 * 6. Implement focus logic (stem isolation and mixing)
 *
 * Version: 2.0.0 (Multi-stem)
 * Date: January 4, 2026
 */

/**
 * Stem identifiers
 */
export type StemId = 'vocals' | 'drums' | 'bass' | 'other';
export const STEM_IDS: StemId[] = ['vocals', 'drums', 'bass', 'other'];

/**
 * Playback state interface
 */
export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;        // In seconds
  duration: number;           // In seconds
  volume: number;             // 0-1 linear scale
  gainDb: number;             // dB scale (-40 to +12)
  playbackRate: number;       // 0.5 to 2.0
}

/**
 * Per-stem volume state
 */
export interface StemVolumes {
  vocals: number;
  drums: number;
  bass: number;
  other: number;
}

export interface StemPlaybackAlignment {
  startTimeSec: number;
  sourceOffsetSec: number;
  durationSec: number;
}

/**
 * Focus mode settings
 */
export interface FocusSettings {
  enabled: boolean;
  focusStem?: StemId;
  focusGain: number;           // Gain for focused stem (default 1.0)
  ghostGain: number;           // Gain for other stems (default 0.1)
}

/**
 * Playback callbacks
 */
export interface PlaybackCallbacks {
  onStateChange?: (state: PlaybackState) => void;
  onError?: (error: Error) => void;
  onEnded?: () => void;
}

export function normalizeStemPlaybackAlignment(
  buffer: AudioBuffer,
  alignment?: Partial<StemPlaybackAlignment>,
): StemPlaybackAlignment {
  const startTimeSec = Math.max(0, alignment?.startTimeSec ?? 0);
  const sourceOffsetSec = Math.max(0, alignment?.sourceOffsetSec ?? 0);
  const maxDuration = Math.max(0, buffer.duration - sourceOffsetSec);
  const durationSec = Math.max(0, Math.min(alignment?.durationSec ?? maxDuration, maxDuration));
  return {
    startTimeSec,
    sourceOffsetSec,
    durationSec,
  };
}

export function buildStemPlaybackSchedule(
  buffer: AudioBuffer,
  alignment: StemPlaybackAlignment | null,
  playheadSec: number,
): { when: number; offset: number; duration: number } | null {
  const effective = alignment ?? normalizeStemPlaybackAlignment(buffer);
  const startAt = Math.max(0, effective.startTimeSec);
  const offsetIntoSource = Math.max(0, effective.sourceOffsetSec + Math.max(0, playheadSec - startAt));
  const remaining = Math.max(0, effective.durationSec - Math.max(0, playheadSec - startAt));
  if (remaining <= 0 || offsetIntoSource >= buffer.duration) {
    return null;
  }

  const offset = Math.min(buffer.duration, offsetIntoSource);
  const duration = Math.min(remaining, Math.max(0, buffer.duration - offset));
  if (duration <= 0) {
    return null;
  }

  return {
    when: Math.max(0, startAt - playheadSec),
    offset,
    duration,
  };
}

export function computeStemPlaybackTimelineDuration(
  buffers: Partial<Record<StemId, AudioBuffer | null>>,
  alignments: Partial<Record<StemId, StemPlaybackAlignment | null>>,
): number {
  let maxDuration = 0;
  for (const stemId of STEM_IDS) {
    const buffer = buffers[stemId];
    if (!buffer) continue;
    const alignment = alignments[stemId] ?? normalizeStemPlaybackAlignment(buffer);
    maxDuration = Math.max(maxDuration, alignment.startTimeSec + alignment.durationSec);
  }
  return maxDuration;
}

/**
 * Audio nodes structure
 */
interface AudioNodes {
  context: AudioContext;
  sources: Map<StemId, AudioBufferSourceNode>;
  stemGains: Map<StemId, GainNode>;          // Per-stem volume control
  masterGain: GainNode;                       // Master volume control
  analyser: AnalyserNode;                     // For visualization
  destination: AudioDestinationNode;
}

/**
 * StemPlaybackService
 *
 * Singleton service that manages multi-stem synchronized playback.
 * Provides mixer architecture with per-stem volume control and focus mode.
 *
 * Mixer Graph:
 *   Stem Audio Buffers
 *     ↓
 *   AudioBufferSourceNodes (4x)
 *     ↓
 *   StemGainNodes (4x) ← Per-stem volume control
 *     ↓
 *   MasterGainNode ← Master volume control
 *     ↓
 *   AnalyserNode ← FFT tap for visualization
 *     ↓
 *   AudioContext.destination (speakers)
 */
class StemPlaybackService {
  private audioBuffers: Map<StemId, AudioBuffer | null> = new Map();
  private stemAlignments: Map<StemId, StemPlaybackAlignment | null> = new Map();
  private nodes: AudioNodes | null = null;
  private state: PlaybackState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    gainDb: 0,
    playbackRate: 1.0,
  };
  private stemVolumes: StemVolumes = {
    vocals: 1.0,
    drums: 1.0,
    bass: 1.0,
    other: 1.0,
  };
  private focusRestoreVolumes: StemVolumes | null = null;
  private focusSettings: FocusSettings = {
    enabled: false,
    focusGain: 1.0,
    ghostGain: 0.1,
  };
  private callbacks: PlaybackCallbacks = {};

  // Timing offsets for accurate currentTime tracking
  private playbackStartTime: number = 0;
  private pausedTime: number = 0;
  private seekTime: number = 0;

  // Animation frame loop for state updates
  private animationFrameId: number | null = null;

  /**
   * Initialize audio context and mixer nodes
   */
  public initialize(): void {
    if (this.nodes) {
      console.log('[StemPlaybackService] Already initialized');
      return;
    }

    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const masterGain = context.createGain();
      const analyser = context.createAnalyser();

      // Configure analyser for FFT
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      // Connect master gain to analyser to destination
      masterGain.connect(analyser);
      analyser.connect(context.destination);

      // Create per-stem gain nodes
      const stemGains = new Map<StemId, GainNode>();
      for (const stemId of STEM_IDS) {
        const stemGain = context.createGain();
        stemGain.connect(masterGain);
        stemGain.gain.value = this.stemVolumes[stemId];
        stemGains.set(stemId, stemGain);
      }

      this.nodes = {
        context,
        sources: new Map(),
        stemGains,
        masterGain,
        analyser,
        destination: context.destination,
      };

      // Initialize audio buffers map
      for (const stemId of STEM_IDS) {
        this.audioBuffers.set(stemId, null);
        this.stemAlignments.set(stemId, null);
      }

      // Set initial volume
      masterGain.gain.value = this.state.volume;

      console.log('[StemPlaybackService] Initialized with multi-stem mixer');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StemPlaybackService] Failed to initialize:', err.message);
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  /**
   * Load a stem audio buffer
   */
  public loadStemBuffer(
    stemId: StemId,
    buffer: AudioBuffer,
    alignment?: Partial<StemPlaybackAlignment>,
  ): void {
    if (!this.nodes) {
      throw new Error('[StemPlaybackService] Not initialized. Call initialize() first.');
    }

    this.audioBuffers.set(stemId, buffer);
    this.stemAlignments.set(stemId, normalizeStemPlaybackAlignment(buffer, alignment));

    // Update duration to the longest stem
    this.state.duration = computeStemPlaybackTimelineDuration(
      Object.fromEntries(this.audioBuffers.entries()) as Partial<Record<StemId, AudioBuffer | null>>,
      Object.fromEntries(this.stemAlignments.entries()) as Partial<Record<StemId, StemPlaybackAlignment | null>>,
    );

    console.log(`[StemPlaybackService] Loaded ${stemId} stem: ${buffer.duration.toFixed(2)}s`);
    this.broadcastState();
  }

  /**
   * Load all stems at once
   */
  public loadAllStems(
    stems: Partial<Record<StemId, AudioBuffer>>,
    alignments?: Partial<Record<StemId, Partial<StemPlaybackAlignment>>>,
  ): void {
    for (const [stemId, buffer] of Object.entries(stems)) {
      if (buffer) {
        this.loadStemBuffer(stemId as StemId, buffer, alignments?.[stemId as StemId]);
      }
    }
  }

  /**
   * Start playback of all loaded stems
   */
  public play(): void {
    if (!this.nodes) {
      console.warn('[StemPlaybackService] Cannot play: not initialized');
      return;
    }

    if (this.state.isPlaying) {
      console.warn('[StemPlaybackService] Already playing');
      return;
    }

    try {
      // Stop any existing sources
      for (const [stemId, source] of this.nodes.sources) {
        try {
          source.stop();
        } catch {
          // Already stopped
        }
      }
      this.nodes.sources.clear();

      // Create and start source for each loaded stem
      for (const stemId of STEM_IDS) {
        const buffer = this.audioBuffers.get(stemId);
        if (!buffer) {
          continue; // Skip if no buffer loaded
        }

        const source = this.nodes.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = this.state.playbackRate;

        // Connect to stem gain node
        const stemGain = this.nodes.stemGains.get(stemId)!;
        source.connect(stemGain);

        const alignment = this.stemAlignments.get(stemId) ?? null;
        const schedule = buildStemPlaybackSchedule(buffer, alignment, this.state.currentTime);
        if (!schedule) {
          continue;
        }

        source.start(this.nodes.context.currentTime + schedule.when, schedule.offset, schedule.duration);

        this.nodes.sources.set(stemId, source);
      }

      this.state.isPlaying = true;
      this.playbackStartTime = this.nodes.context.currentTime;
      this.seekTime = this.state.currentTime;

      // Start state update loop
      this.startStateUpdateLoop();

      console.log(`[StemPlaybackService] Playing ${this.nodes.sources.size} stems from ${this.state.currentTime.toFixed(2)}s`);
      this.broadcastState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StemPlaybackService] Play failed:', err.message);
      this.callbacks.onError?.(err);
    }
  }

  /**
   * Pause playback of all stems
   */
  public pause(): void {
    if (!this.nodes || !this.state.isPlaying) {
      return;
    }

    try {
      // Stop all sources
      for (const [stemId, source] of this.nodes.sources) {
        try {
          source.stop();
        } catch {
          // Already stopped
        }
      }
      this.nodes.sources.clear();

      // Update accumulated pause time
      const elapsedTime = this.nodes.context.currentTime - this.playbackStartTime;
      this.pausedTime += elapsedTime;
      this.state.currentTime = this.seekTime + this.pausedTime;

      // Clamp to duration
      this.state.currentTime = Math.min(this.state.currentTime, this.state.duration);

      this.state.isPlaying = false;
      this.stopStateUpdateLoop();

      console.log(`[StemPlaybackService] Paused at ${this.state.currentTime.toFixed(2)}s`);
      this.broadcastState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[StemPlaybackService] Pause failed:', err.message);
      this.callbacks.onError?.(err);
    }
  }

  /**
   * Seek to a specific time (all stems)
   */
  public seek(timeSeconds: number): void {
    const clampedTime = Math.max(0, Math.min(timeSeconds, this.state.duration));

    if (this.state.isPlaying) {
      // If playing, pause and restart from new position
      this.pause();
      this.state.currentTime = clampedTime;
      this.pausedTime = 0;
      this.seekTime = clampedTime;
      this.play();
    } else {
      // If paused, just update position
      this.state.currentTime = clampedTime;
      this.pausedTime = 0;
      this.seekTime = clampedTime;
    }

    console.log(`[StemPlaybackService] Seeked to ${clampedTime.toFixed(2)}s`);
    this.broadcastState();
  }

  /**
   * Set volume for a specific stem
   */
  public setStemVolume(stemId: StemId, volume: number): void {
    if (!this.nodes) {
      console.warn('[StemPlaybackService] Not initialized');
      return;
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.stemVolumes[stemId] = clampedVolume;

    // Update the stem gain node
    const stemGain = this.nodes.stemGains.get(stemId);
    if (stemGain) {
      stemGain.gain.value = clampedVolume;
    }

    console.log(`[StemPlaybackService] ${stemId} volume set to ${(clampedVolume * 100).toFixed(1)}%`);
    this.broadcastState();
  }

  /**
   * Get current volume for a stem
   */
  public getStemVolume(stemId: StemId): number {
    return this.stemVolumes[stemId];
  }

  /**
   * Get all stem volumes
   */
  public getAllStemVolumes(): StemVolumes {
    return { ...this.stemVolumes };
  }

  /**
   * Enable focus mode (isolate or boost specific stem)
   */
  public setFocus(stemId: StemId | undefined, focusGain: number = 1.0, ghostGain: number = 0.1): void {
    if (!this.nodes) {
      console.warn('[StemPlaybackService] Not initialized');
      return;
    }

    const wasFocused = this.focusSettings.enabled;
    if (stemId && !wasFocused) {
      this.focusRestoreVolumes = { ...this.stemVolumes };
    }

    this.focusSettings.enabled = !!stemId;
    this.focusSettings.focusStem = stemId;
    this.focusSettings.focusGain = focusGain;
    this.focusSettings.ghostGain = ghostGain;

    const restoreVolumes = !stemId && this.focusRestoreVolumes ? this.focusRestoreVolumes : null;

    // Apply focus to all stems.
    for (const id of STEM_IDS) {
      let nextVolume = 1.0;
      if (stemId) {
        nextVolume = id === stemId ? focusGain : ghostGain;
      } else if (restoreVolumes) {
        nextVolume = restoreVolumes[id];
      }
      this.setStemVolume(id, nextVolume);
    }

    if (!stemId) {
      this.focusRestoreVolumes = null;
    }

    if (stemId) {
      console.log(`[StemPlaybackService] Focus mode: ${stemId} at ${(focusGain * 100).toFixed(1)}%, others at ${(ghostGain * 100).toFixed(1)}%`);
    } else {
      console.log('[StemPlaybackService] Focus mode disabled');
    }

    this.broadcastState();
  }

  /**
   * Reset all stem volumes to 1.0
   */
  public resetFocus(): void {
    this.setFocus(undefined);
  }

  /**
   * Set master playback volume
   */
  public setVolume(volume: number): void {
    if (!this.nodes) {
      console.warn('[StemPlaybackService] Not initialized');
      return;
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.state.volume = clampedVolume;

    // Convert linear (0-1) to gain (exponential curve)
    const gainDb = clampedVolume === 0 ? -40 : 20 * Math.log10(clampedVolume);
    this.state.gainDb = gainDb;

    this.nodes.masterGain.gain.value = clampedVolume;

    console.log(`[StemPlaybackService] Master volume set to ${(clampedVolume * 100).toFixed(1)}% (${gainDb.toFixed(1)}dB)`);
    this.broadcastState();
  }

  /**
   * Set playback rate for all stems
   */
  public setPlaybackRate(rate: number): void {
    const clampedRate = Math.max(0.25, Math.min(2.0, rate));
    this.state.playbackRate = clampedRate;

    // Update all active sources
    for (const source of this.nodes?.sources.values() || []) {
      source.playbackRate.value = clampedRate;
    }

    console.log(`[StemPlaybackService] Playback rate set to ${clampedRate.toFixed(2)}x`);
    this.broadcastState();
  }

  /**
   * Get the analyser node for FFT visualization
   */
  public getAnalyser(): AnalyserNode | null {
    return this.nodes?.analyser || null;
  }

  /**
   * Get current playback state
   */
  public getState(): PlaybackState {
    return { ...this.state };
  }

  /**
   * Get current focus settings
   */
  public getFocusSettings(): FocusSettings {
    return { ...this.focusSettings };
  }

  /**
   * Register callbacks
   */
  public onStateChange(callback: (state: PlaybackState) => void): void {
    this.callbacks.onStateChange = callback;
  }

  public onError(callback: (error: Error) => void): void {
    this.callbacks.onError = callback;
  }

  public onEnded(callback: () => void): void {
    this.callbacks.onEnded = callback;
  }

  /**
   * Update current time based on audio context time
   */
  private updateCurrentTime(): void {
    if (!this.nodes || !this.state.isPlaying) {
      return;
    }

    const elapsedTime = (this.nodes.context.currentTime - this.playbackStartTime) / this.state.playbackRate;
    this.state.currentTime = this.seekTime + this.pausedTime + elapsedTime;

    // Clamp to duration (prevents overshoot)
    if (this.state.currentTime >= this.state.duration) {
      this.state.currentTime = this.state.duration;
      this.handlePlaybackEnded();
    }
  }

  /**
   * Handle playback ending naturally
   */
  private handlePlaybackEnded(): void {
    console.log('[StemPlaybackService] Playback ended');

    this.state.isPlaying = false;
    this.stopStateUpdateLoop();

    // Stop all sources
    if (this.nodes) {
      for (const source of this.nodes.sources.values()) {
        try {
          source.stop();
        } catch {
          // Already stopped
        }
      }
      this.nodes.sources.clear();
    }

    this.broadcastState();
    this.callbacks.onEnded?.();
  }

  /**
   * Broadcast state changes to UI
   */
  private broadcastState(): void {
    this.callbacks.onStateChange?.(this.getState());
  }

  /**
   * Start the state update loop
   */
  private startStateUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      return; // Already running
    }

    const loop = () => {
      this.updateCurrentTime();
      this.broadcastState();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop the state update loop
   */
  private stopStateUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    try {
      this.pause();
      this.stopStateUpdateLoop();

      if (this.nodes) {
        this.nodes.sources.clear();
      }

      console.log('[StemPlaybackService] Disposed');
    } catch (error) {
      console.error('[StemPlaybackService] Error during dispose:', error);
    }
  }

  /**
   * Get audio context (for advanced users)
   */
  public getAudioContext(): AudioContext | null {
    return this.nodes?.context || null;
  }

  /**
   * Get duration in seconds
   */
  public getDuration(): number {
    return this.state.duration;
  }

  /**
   * Check if currently playing
   */
  public isPlaying(): boolean {
    return this.state.isPlaying;
  }

}

/**
 * Singleton instance
 */
export const stemPlaybackService = new StemPlaybackService();

export default stemPlaybackService;
