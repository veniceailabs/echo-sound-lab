/**
 * AUDIO PLAYBACK SERVICE
 *
 * Sprint 2: Heartbeat
 * Wraps Web Audio API and manages playback state
 *
 * Core Responsibilities:
 * 1. Manage AudioContext and playback nodes
 * 2. Handle play/pause/seek operations
 * 3. Track and broadcast currentTime to visualizations
 * 4. Expose AnalyserNode for FFT data capture
 * 5. Manage volume/gain control
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

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
 * Playback callbacks
 */
export interface PlaybackCallbacks {
  onStateChange?: (state: PlaybackState) => void;
  onError?: (error: Error) => void;
  onEnded?: () => void;
}

/**
 * Audio nodes structure
 */
interface AudioNodes {
  context: AudioContext;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  analyser: AnalyserNode;
  destination: AudioDestinationNode;
}

/**
 * AudioPlaybackService
 *
 * Singleton service that manages Web Audio API playback.
 * Provides real-time state tracking and visualization sync.
 */
class AudioPlaybackService {
  private audioBuffer: AudioBuffer | null = null;
  private nodes: AudioNodes | null = null;
  private state: PlaybackState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    gainDb: 0,
    playbackRate: 1.0,
  };
  private callbacks: PlaybackCallbacks = {};

  // Timing offsets for accurate currentTime tracking
  private playbackStartTime: number = 0;    // When play() was called
  private pausedTime: number = 0;           // Accumulated pause time
  private seekTime: number = 0;             // Target time after seek

  // Animation frame loop for state updates
  private animationFrameId: number | null = null;

  /**
   * Initialize audio context and nodes
   */
  public initialize(): void {
    if (this.nodes) {
      console.log('[AudioPlaybackService] Already initialized');
      return;
    }

    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gainNode = context.createGain();
      const analyser = context.createAnalyser();

      // Configure analyser for FFT
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      // Connect nodes: source -> gainNode -> analyser -> destination
      gainNode.connect(analyser);
      analyser.connect(context.destination);

      this.nodes = {
        context,
        source: null,
        gainNode,
        analyser,
        destination: context.destination,
      };

      // Set initial volume
      gainNode.gain.value = this.state.volume;

      console.log('[AudioPlaybackService] Initialized with AudioContext');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[AudioPlaybackService] Failed to initialize:', err.message);
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  /**
   * Load an audio buffer for playback
   */
  public loadAudioBuffer(buffer: AudioBuffer): void {
    if (!this.nodes) {
      throw new Error('[AudioPlaybackService] Not initialized. Call initialize() first.');
    }

    // Stop any currently playing audio
    if (this.state.isPlaying) {
      this.pause();
    }

    this.audioBuffer = buffer;
    this.state.duration = buffer.duration;
    this.state.currentTime = 0;
    this.seekTime = 0;
    this.pausedTime = 0;

    console.log(`[AudioPlaybackService] Loaded audio buffer: ${buffer.duration.toFixed(2)}s`);
    this.broadcastState();
  }

  /**
   * Start playback
   */
  public play(): void {
    if (!this.nodes || !this.audioBuffer) {
      console.warn('[AudioPlaybackService] Cannot play: not initialized or no audio buffer');
      return;
    }

    if (this.state.isPlaying) {
      console.warn('[AudioPlaybackService] Already playing');
      return;
    }

    try {
      // Stop any existing source
      if (this.nodes.source) {
        try {
          this.nodes.source.stop();
        } catch {
          // Already stopped
        }
      }

      // Create new source
      const source = this.nodes.context.createBufferSource();
      source.buffer = this.audioBuffer;
      source.playbackRate.value = this.state.playbackRate;

      // Connect to gain node
      source.connect(this.nodes.gainNode);

      // Handle end of playback
      source.onended = () => {
        this.handlePlaybackEnded();
      };

      // Calculate start offset
      const startTime = Math.max(0, Math.min(this.state.currentTime, this.audioBuffer.duration));
      source.start(0, startTime);

      this.nodes.source = source;
      this.state.isPlaying = true;
      this.playbackStartTime = this.nodes.context.currentTime;
      this.seekTime = startTime;

      // Start state update loop
      this.startStateUpdateLoop();

      console.log(`[AudioPlaybackService] Playing from ${startTime.toFixed(2)}s`);
      this.broadcastState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[AudioPlaybackService] Play failed:', err.message);
      this.callbacks.onError?.(err);
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (!this.nodes || !this.state.isPlaying) {
      return;
    }

    try {
      if (this.nodes.source) {
        this.nodes.source.stop();
        this.nodes.source = null;
      }

      // Update accumulated pause time
      const elapsedTime = this.nodes.context.currentTime - this.playbackStartTime;
      this.pausedTime += elapsedTime;
      this.state.currentTime = this.seekTime + this.pausedTime;

      // Clamp to duration
      this.state.currentTime = Math.min(this.state.currentTime, this.audioBuffer!.duration);

      this.state.isPlaying = false;
      this.stopStateUpdateLoop();

      console.log(`[AudioPlaybackService] Paused at ${this.state.currentTime.toFixed(2)}s`);
      this.broadcastState();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[AudioPlaybackService] Pause failed:', err.message);
      this.callbacks.onError?.(err);
    }
  }

  /**
   * Seek to a specific time
   */
  public seek(timeSeconds: number): void {
    if (!this.audioBuffer) {
      console.warn('[AudioPlaybackService] Cannot seek: no audio buffer loaded');
      return;
    }

    const clampedTime = Math.max(0, Math.min(timeSeconds, this.audioBuffer.duration));

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

    console.log(`[AudioPlaybackService] Seeked to ${clampedTime.toFixed(2)}s`);
    this.broadcastState();
  }

  /**
   * Set playback volume (0-1 linear scale)
   */
  public setVolume(volume: number): void {
    if (!this.nodes) {
      console.warn('[AudioPlaybackService] Not initialized');
      return;
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.state.volume = clampedVolume;

    // Convert linear (0-1) to gain (exponential curve)
    // 0 -> -40dB, 1 -> 0dB
    const gainDb = clampedVolume === 0 ? -40 : 20 * Math.log10(clampedVolume);
    this.state.gainDb = gainDb;

    // Set gain node value (0-1 linear, which is exponential in dB)
    this.nodes.gainNode.gain.value = clampedVolume;

    console.log(`[AudioPlaybackService] Volume set to ${(clampedVolume * 100).toFixed(1)}% (${gainDb.toFixed(1)}dB)`);
    this.broadcastState();
  }

  /**
   * Set playback rate
   */
  public setPlaybackRate(rate: number): void {
    const clampedRate = Math.max(0.25, Math.min(2.0, rate));
    this.state.playbackRate = clampedRate;

    if (this.nodes?.source) {
      this.nodes.source.playbackRate.value = clampedRate;
    }

    console.log(`[AudioPlaybackService] Playback rate set to ${clampedRate.toFixed(2)}x`);
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
   * Register callbacks for state changes
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
    this.state.currentTime = Math.min(this.state.currentTime, this.audioBuffer!.duration);
  }

  /**
   * Handle playback ending naturally
   */
  private handlePlaybackEnded(): void {
    console.log('[AudioPlaybackService] Playback ended');

    this.state.isPlaying = false;
    this.state.currentTime = this.audioBuffer!.duration;
    this.stopStateUpdateLoop();

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
   * Start the state update loop (broadcasts every frame)
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
        this.nodes.source = null;
        // Note: Don't close AudioContext, it may be shared
      }

      console.log('[AudioPlaybackService] Disposed');
    } catch (error) {
      console.error('[AudioPlaybackService] Error during dispose:', error);
    }
  }

  /**
   * Get audio context (for advanced users)
   */
  public getAudioContext(): AudioContext | null {
    return this.nodes?.context || null;
  }

  /**
   * Get current time in seconds
   */
  public getCurrentTime(): number {
    return this.state.currentTime;
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
export const audioPlaybackService = new AudioPlaybackService();

export default audioPlaybackService;
