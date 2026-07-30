/**
 * STEM SEPARATION SERVICE
 *
 * Sprint 2C: The Intelligence
 * Manages audio stem separation with fallback and hybrid bridge support
 *
 * Architecture:
 * - Compatibility mode: Uses a local approximation when the real bridge is unavailable
 * - Hybrid bridge: Future integration with local Demucs server on M2 Pro
 * - Pipeline: Audio → Separation → Transcription → Visualization
 *
 * Version: 1.0.0
 * Date: January 5, 2026
 */

import { NoteTranscriptionService } from '../modules/master-class/engine/NoteTranscriptionService';
import { separateStemsViaReplicateWithEnvKey } from './replicateDemucsService';
import { separateStems as eslHpssSeparate } from './stemSeparation/eslStemSeparator';
import {
  buildProofTrainerSessionManifestFromTracks,
  type ProofTrainerDecodedTrack,
  type ProofTrainerSessionManifest,
} from './sessionAlignmentService';

const DEFAULT_BRIDGE_HTTP_URL = 'http://127.0.0.1:8000';
const DEFAULT_BRIDGE_WS_URL = 'ws://127.0.0.1:8000/ws/bridge';

/**
 * Separation mode
 */
export type SeparationMode = 'mock' | 'local-demucs' | 'cloud' | 'replicate' | 'esl-hpss';

/**
 * Separated stems result
 */
export interface SeparatedStems {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  other: AudioBuffer;
  metadata: {
    mode: SeparationMode;
    duration: number;
    sampleRate: number;
    processingTimeMs: number;
    alignmentManifest?: ProofTrainerSessionManifest;
  };
}

/**
 * Transcription result for each stem
 */
export interface StemTranscription {
  vocals: Array<{ pitch: number; startTime: number; endTime: number; velocity: number }>;
  drums: Array<{ pitch: number; startTime: number; endTime: number; velocity: number }>;
  bass: Array<{ pitch: number; startTime: number; endTime: number; velocity: number }>;
  other: Array<{ pitch: number; startTime: number; endTime: number; velocity: number }>;
}

/**
 * Service state for UI feedback
 */
export interface SeparationState {
  isProcessing: boolean;
  mode: SeparationMode;
  preferredMode: SeparationMode;
  step: 'idle' | 'separating' | 'transcribing' | 'complete';
  progress: number; // 0-100
  error: string | null;
  availability: 'unknown' | 'checking' | 'ready' | 'fallback';
  statusMessage: string | null;
  fallbackReason: string | null;
  bridge: {
    httpUrl: string;
    wsUrl: string;
    available: boolean;
    device?: string;
  };
}

/**
 * StemSeparationService
 *
 * Manages the complete pipeline from raw audio to transcribed stems.
 * Supports both compatibility fallback and hybrid bridge separation.
 *
 * Design Philosophy:
 * - Compatibility fallback is deterministic and requires no external dependencies
 * - Real Demucs integration plugs in later via hybrid bridge
 * - Transcription always uses same algorithm (autocorrelation)
 * - Output format is identical for both paths
 */
class StemSeparationService {
  private audioContext: AudioContext | null = null;
  private mode: SeparationMode = 'esl-hpss';
  private preferredMode: SeparationMode = 'esl-hpss';
  private bridgeHttpUrl = DEFAULT_BRIDGE_HTTP_URL;
  private bridgeWsUrl = DEFAULT_BRIDGE_WS_URL;
  private state: SeparationState = {
    isProcessing: false,
    mode: 'esl-hpss',
    preferredMode: 'esl-hpss',
    step: 'idle',
    progress: 0,
    error: null,
    availability: 'unknown',
    statusMessage: null,
    fallbackReason: null,
    bridge: {
      httpUrl: DEFAULT_BRIDGE_HTTP_URL,
      wsUrl: DEFAULT_BRIDGE_WS_URL,
      available: false,
    },
  };

  /**
   * Initialize the separation service
   */
  public async initialize(mode: SeparationMode = 'esl-hpss'): Promise<SeparationState> {
    this.preferredMode = mode;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.state.preferredMode = mode;
    this.state.error = null;
    this.state.fallbackReason = null;
    this.state.statusMessage = null;

    if (mode !== 'local-demucs') {
      this.mode = mode;
      this.state.mode = mode;
      this.state.availability = 'ready';
      this.state.bridge.available = false;
      if (mode === 'esl-hpss') {
        this.state.statusMessage = 'ESL HPSS (In-Browser) stem separation ready.';
      } else if (mode === 'mock') {
        this.state.statusMessage = 'Demo stem separation mode enabled.';
      } else if (mode === 'replicate') {
        this.state.statusMessage = 'Replicate Demucs cloud separation enabled. Requires VITE_REPLICATE_API_KEY.';
      } else {
        this.state.statusMessage = 'Cloud stem separation is not available in this build.';
      }
      console.log(`[StemSeparationService] Initialized in ${mode} mode`);
      return this.getState();
    }

    this.state.availability = 'checking';
    this.state.statusMessage = 'Checking local bridge for real Demucs separation...';

    const availability = await this.checkBridgeAvailability();
    if (availability.available) {
      this.mode = 'local-demucs';
      this.state.mode = 'local-demucs';
      this.state.availability = 'ready';
      this.state.fallbackReason = null;
      this.state.statusMessage = `Real Demucs separation ready${availability.device ? ` on ${availability.device}` : ''}.`;
    } else {
      this.mode = 'esl-hpss';
      this.state.mode = 'esl-hpss';
      this.state.availability = 'fallback';
      this.state.fallbackReason = availability.reason;
      this.state.statusMessage = 'Local bridge unavailable. Using ESL HPSS (In-Browser) separation.';
    }

    this.state.bridge = {
      httpUrl: this.bridgeHttpUrl,
      wsUrl: this.bridgeWsUrl,
      available: availability.available,
      device: availability.device,
    };

    console.log(
      `[StemSeparationService] Initialized with preferred=${mode}, active=${this.mode}, availability=${this.state.availability}`
    );
    return this.getState();
  }

  /**
   * Separate audio into stems and transcribe
   *
   * Main entry point: Upload → Separation → Transcription → Visualization
   */
  public async processAudioFile(
    audioBuffer: AudioBuffer,
    onProgress?: (state: SeparationState) => void
  ): Promise<{ stems: SeparatedStems; transcription: StemTranscription }> {
    const startTime = performance.now();

    if (!this.audioContext) {
      throw new Error('[StemSeparationService] Not initialized. Call initialize() first.');
    }

    if (this.state.isProcessing) {
      throw new Error('[StemSeparationService] Already processing. Wait for current operation to complete.');
    }

    this.state.isProcessing = true;
    this.state.error = null;

    try {
      // STEP 1: Separate stems
      this.state.step = 'separating';
      this.state.progress = 0;
      onProgress?.(this.state);

      const stems = await this.separateAudio(audioBuffer, onProgress);
      const alignmentManifest = this.buildAlignmentManifest(stems);

      // STEP 2: Transcribe each stem
      this.state.step = 'transcribing';
      this.state.progress = 50;
      onProgress?.(this.state);

      const transcription = this.transcribeStems(stems);

      // STEP 3: Complete
      this.state.step = 'complete';
      this.state.progress = 100;
      this.state.isProcessing = false;

      // Add metadata
      stems.metadata.processingTimeMs = performance.now() - startTime;
      stems.metadata.alignmentManifest = alignmentManifest;

      onProgress?.(this.state);

      console.log(`[StemSeparationService] Processing complete in ${stems.metadata.processingTimeMs.toFixed(0)}ms`);

      return { stems, transcription };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.state.isProcessing = false;
      this.state.error = err.message;
      this.state.step = 'idle';
      onProgress?.(this.state);
      throw err;
    }
  }

  /**
   * Separate audio into stems (implementation based on mode)
   */
  private async separateAudio(
    audioBuffer: AudioBuffer,
    onProgress?: (state: SeparationState) => void
  ): Promise<SeparatedStems> {
    if (this.mode === 'esl-hpss' || this.mode === 'mock') {
      // Real in-browser HPSS separation (replaces old mock)
      return this.separateAudioEslHpss(audioBuffer, onProgress);
    } else if (this.mode === 'local-demucs') {
      try {
        return await this.separateAudioLocalDemucs(audioBuffer, onProgress);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[StemSeparationService] Real bridge separation failed, falling back to ESL HPSS:', message);
        this.mode = 'esl-hpss';
        this.state.mode = 'esl-hpss';
        this.state.availability = 'fallback';
        this.state.fallbackReason = message;
        this.state.statusMessage = 'Real separation unavailable. Using ESL HPSS (In-Browser) separation.';
        onProgress?.(this.getState());
        return this.separateAudioEslHpss(audioBuffer, onProgress);
      }
    } else if (this.mode === 'replicate') {
      try {
        return await this.separateAudioReplicate(audioBuffer, onProgress);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[StemSeparationService] Replicate separation failed, falling back to ESL HPSS:', message);
        this.mode = 'esl-hpss';
        this.state.mode = 'esl-hpss';
        this.state.availability = 'fallback';
        this.state.fallbackReason = message;
        this.state.statusMessage = 'Replicate separation unavailable. Using ESL HPSS (In-Browser) separation.';
        onProgress?.(this.getState());
        return this.separateAudioEslHpss(audioBuffer, onProgress);
      }
    } else {
      const message = 'Cloud stem separation is not enabled in this build. Using ESL HPSS (In-Browser) separation.';
      console.warn(`[StemSeparationService] ${message}`);
      this.mode = 'esl-hpss';
      this.state.mode = 'esl-hpss';
      this.state.availability = 'fallback';
      this.state.fallbackReason = message;
      this.state.statusMessage = 'Using ESL HPSS (In-Browser) separation.';
      onProgress?.(this.getState());
      return this.separateAudioEslHpss(audioBuffer, onProgress);
    }
  }

  /**
   * ESL HPSS IN-BROWSER SEPARATION
   *
   * Real stem separation using Harmonic-Percussive Source Separation.
   * No external API calls — runs entirely in the browser using Web Audio API.
   * Algorithm: Cooley-Tukey FFT → median filter HPSS → Wiener soft masks → ISTFT
   */
  private async separateAudioEslHpss(
    audioBuffer: AudioBuffer,
    onProgress?: (state: SeparationState) => void
  ): Promise<SeparatedStems> {
    console.log('[StemSeparationService] Running ESL HPSS (In-Browser) separation...');

    const result = await eslHpssSeparate(audioBuffer, (pct, stage) => {
      // Map ESL HPSS progress (0-95) to our 0-48 range (separation phase)
      this.state.progress = Math.round(pct * 0.5);
      this.state.statusMessage = stage;
      onProgress?.(this.getState());
    });

    return {
      vocals: result.vocals,
      drums: result.drums,
      bass: result.bass,
      other: result.other,
      metadata: {
        mode: 'esl-hpss',
        duration: result.metadata.duration,
        sampleRate: result.metadata.sampleRate,
        processingTimeMs: result.metadata.processingTimeMs,
      },
    };
  }

  // Note: separateAudioMock() removed — ESL HPSS (separateAudioEslHpss) is the
  // default in-browser engine. All fallback paths now use real DSP separation.

  /**
   * LOCAL DEMUCS SEPARATION (hybrid bridge)
   *
   * Future implementation for real separation.
   * Will communicate with Python sidecar running Demucs on M2 Pro Neural Engine.
   *
   * Interface to implement:
   * 1. POST /api/separate with audio buffer
   * 2. Poll /api/status until complete
   * 3. GET /api/stems/{stem_name}.wav
   * 4. Return 4 AudioBuffer objects
   */
  private async separateAudioLocalDemucs(
    audioBuffer: AudioBuffer,
    onProgress?: (state: SeparationState) => void
  ): Promise<SeparatedStems> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const availability = await this.checkBridgeAvailability();
    if (!availability.available) {
      throw new Error(availability.reason || 'Local bridge is offline');
    }

    this.state.availability = 'ready';
    this.state.statusMessage = `Separating stems with local Demucs${availability.device ? ` on ${availability.device}` : ''}...`;
    this.state.bridge.available = true;
    this.state.bridge.device = availability.device;
    this.state.progress = 5;
    onProgress?.(this.getState());

    const filename = `stem_source_${Date.now()}.wav`;
    const audioData = await this.encodeAudioBufferToBase64Wav(audioBuffer);
    const separationResult = await this.requestLocalDemucsSeparation(filename, audioData, onProgress);

    this.state.progress = 92;
    this.state.statusMessage = 'Downloading separated stems from local bridge...';
    onProgress?.(this.getState());

    const [vocals, drums, bass, other] = await Promise.all([
      this.decodeAudioFromUrl(separationResult.vocals),
      this.decodeAudioFromUrl(separationResult.drums),
      this.decodeAudioFromUrl(separationResult.bass),
      this.decodeAudioFromUrl(separationResult.other),
    ]);

    return {
      vocals,
      drums,
      bass,
      other,
      metadata: {
        mode: 'local-demucs',
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        processingTimeMs: separationResult.processingTimeMs,
      },
    };
  }

  /**
   * REPLICATE DEMUCS SEPARATION (cloud via Replicate API)
   *
   * Encodes the AudioBuffer as a WAV blob, uploads to Replicate's hosted
   * meta/demucs model (htdemucs_ft), polls until complete, downloads the
   * 4 returned stem URLs and decodes them into AudioBuffers.
   *
   * Requires VITE_REPLICATE_API_KEY in .env.local.
   */
  private async separateAudioReplicate(
    audioBuffer: AudioBuffer,
    onProgress?: (state: SeparationState) => void
  ): Promise<SeparatedStems> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const startTime = performance.now();

    // Convert AudioBuffer → WAV ArrayBuffer → Blob
    const wavArrayBuffer = this.audioBufferToWav(audioBuffer);
    const audioBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' });

    const stemProgressAdapter = (status: string) => {
      this.state.statusMessage = status;
      onProgress?.(this.getState());
    };

    stemProgressAdapter('Uploading audio to Replicate...');

    const stems = await separateStemsViaReplicateWithEnvKey(
      audioBlob,
      stemProgressAdapter,
      this.audioContext
    );

    const processingTimeMs = performance.now() - startTime;

    return {
      ...stems,
      metadata: {
        mode: 'replicate',
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        processingTimeMs,
      },
    };
  }

  /**
   * Transcribe all stems to MIDI notes
   *
   * Uses autocorrelation algorithm on each stem independently.
   * Bass transcription will be most accurate (monophonic, low-frequency).
   * Vocals transcription will also be good (single voice, high SNR in focus mode).
   */
  private transcribeStems(stems: SeparatedStems): StemTranscription {
    console.log('[StemSeparationService] Transcribing stems...');

    return {
      vocals: NoteTranscriptionService.transcribeAudioBufferToNotes(stems.vocals, 0.05),
      drums: NoteTranscriptionService.transcribeAudioBufferToNotes(stems.drums, 0.05),
      bass: NoteTranscriptionService.transcribeAudioBufferToNotes(stems.bass, 0.05),
      other: NoteTranscriptionService.transcribeAudioBufferToNotes(stems.other, 0.05),
    };
  }

  private buildAlignmentManifest(stems: Pick<SeparatedStems, 'vocals' | 'drums' | 'bass' | 'other'>): ProofTrainerSessionManifest {
    const tracks: ProofTrainerDecodedTrack[] = [
      {
        trackId: 'separated-vocals',
        fileName: 'vocals.wav',
        role: 'lead',
        kind: 'vocal',
        buffer: stems.vocals,
      },
      {
        trackId: 'separated-drums',
        fileName: 'drums.wav',
        role: 'beat',
        kind: 'beat',
        buffer: stems.drums,
      },
      {
        trackId: 'separated-bass',
        fileName: 'bass.wav',
        role: 'bass',
        kind: 'other',
        buffer: stems.bass,
      },
      {
        trackId: 'separated-other',
        fileName: 'other.wav',
        role: 'support',
        kind: 'other',
        buffer: stems.other,
      },
    ];

    return buildProofTrainerSessionManifestFromTracks(tracks, {
      referenceStyle: 'stem-separation-local',
      requestText: 'Local stem separation alignment',
      acceptToVault: false,
    });
  }

  /**
   * Get current service state
   */
  public getState(): SeparationState {
    return { ...this.state };
  }

  /**
   * Set separation mode
   */
  public setMode(mode: SeparationMode): void {
    if (this.state.isProcessing) {
      console.warn('[StemSeparationService] Cannot change mode while processing');
      return;
    }

    this.mode = mode;
    this.state.mode = mode;
    this.state.preferredMode = mode;
    this.preferredMode = mode;
    console.log(`[StemSeparationService] Mode changed to ${mode}`);
  }

  /**
   * Get available separation modes
   */
  public getAvailableModes(): SeparationMode[] {
    return ['esl-hpss', 'local-demucs', 'replicate', 'cloud', 'mock'];
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.state.isProcessing = false;
    this.state.step = 'idle';
    console.log('[StemSeparationService] Disposed');
  }

  private async checkBridgeAvailability(): Promise<{
    available: boolean;
    reason?: string;
    device?: string;
  }> {
    try {
      const response = await fetch(`${this.bridgeHttpUrl}/health`);
      if (!response.ok) {
        return {
          available: false,
          reason: `Bridge health check failed with ${response.status}`,
        };
      }

      const payload = await response.json();
      return {
        available: payload.status === 'online',
        reason: payload.status === 'online' ? undefined : 'Bridge reported unavailable status',
        device: payload.device,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async requestLocalDemucsSeparation(
    filename: string,
    audioData: string,
    onProgress?: (state: SeparationState) => void
  ): Promise<{
    vocals: string;
    drums: string;
    bass: string;
    other: string;
    processingTimeMs: number;
  }> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.bridgeWsUrl);
      let settled = false;
      const timeout = window.setTimeout(() => {
        fail(new Error('Local Demucs separation timed out'));
      }, 180000);

      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      socket.onopen = () => {
        socket.send(JSON.stringify({
          action: 'SEPARATE_AUDIO',
          filename,
          audio_data: audioData,
        }));
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.status === 'loading' || payload.status === 'processing') {
            this.state.progress = typeof payload.progress === 'number' ? payload.progress : this.state.progress;
            this.state.statusMessage = payload.message || payload.stage || this.state.statusMessage;
            onProgress?.(this.getState());
            return;
          }

          if (payload.status === 'error') {
            fail(new Error(payload.message || payload.error || 'Stem separation failed'));
            return;
          }

          if (payload.status === 'complete' && payload.result) {
            const result = payload.result;
            if (!result.vocals || !result.drums || !result.bass || !result.other) {
              fail(new Error('Bridge returned incomplete stem set'));
              return;
            }

            if (settled) {
              return;
            }

            settled = true;
            cleanup();
            resolve({
              vocals: result.vocals,
              drums: result.drums,
              bass: result.bass,
              other: result.other,
              processingTimeMs: payload.metadata?.processing_time_ms || 0,
            });
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      socket.onerror = () => {
        fail(new Error('Failed to connect to local bridge WebSocket'));
      };

      socket.onclose = () => {
        if (!settled) {
          fail(new Error('Local bridge WebSocket closed before completion'));
        }
      };
    });
  }

  private async decodeAudioFromUrl(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch stem audio: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  private async encodeAudioBufferToBase64Wav(audioBuffer: AudioBuffer): Promise<string> {
    const wavBuffer = this.audioBufferToWav(audioBuffer);
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private audioBufferToWav(audioBuffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 16): ArrayBuffer {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const audioFormat = bitDepth === 32 ? 3 : 1; // 3 = IEEE_FLOAT, 1 = PCM
    const bytesPerSample = bitDepth / 8;
    const numFrames = audioBuffer.length;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeAscii(view, 8, 'WAVE');
    this.writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, audioFormat, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const channelData = Array.from({ length: numChannels }, (_, index) => audioBuffer.getChannelData(index));
    let offset = 44;
    for (let frame = 0; frame < numFrames; frame++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
        if (bitDepth === 32) {
          view.setFloat32(offset, sample, true);
          offset += 4;
        } else if (bitDepth === 24) {
          const int24 = Math.max(-8388608, Math.min(8388607, Math.round(sample * 8388607)));
          view.setUint8(offset,     int24 & 0xFF);
          view.setUint8(offset + 1, (int24 >> 8) & 0xFF);
          view.setUint8(offset + 2, (int24 >> 16) & 0xFF);
          offset += 3;
        } else {
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += 2;
        }
      }
    }

    return buffer;
  }

  private writeAscii(view: DataView, offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }
}

/**
 * Singleton instance
 */
export const stemSeparationService = new StemSeparationService();

export default stemSeparationService;
