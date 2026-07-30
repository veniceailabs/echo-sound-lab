import { INTEGRATION_FLAGS } from '../config/integrationFlags';
import { nativeVoiceService } from './nativeVoiceService';

/**
 * BRIDGE SERVICE
 * Connects React Frontend to Local Python Neural Engine (M2 Pro)
 *
 * Provides WebSocket communication for:
 * - Audio stem separation (Demucs)
 * - Video generation (Echo Cinema)
 * - Real-time progress reporting
 *
 * Usage:
 * ```
 * import { bridge } from '../services/BridgeService';
 *
 * // Connect to bridge
 * bridge.connect();
 *
 * // Subscribe to messages
 * const unsub = bridge.subscribe((msg) => {
 *   console.log(`Progress: ${msg.progress}%`);
 * });
 *
 * // Send command
 * bridge.separateAudio('my-song.mp3');
 * ```
 */

export type BridgeStatus = 'idle' | 'loading' | 'processing' | 'rendering' | 'complete' | 'error' | 'disconnected';

/**
 * Voice routing configuration for hybrid demo generation
 */
export interface VoiceRoutingConfig {
  elevenlabsEnabled: boolean;
  defaultVoiceProvider: 'elevenlabs' | 'pyttsx3';
  fallbackEnabled: boolean;
}

export interface BridgeMessage {
  status: BridgeStatus;
  action?: string;
  progress?: number;              // 0-100
  stage?: string;                 // "Loading Model", "Separating Vocals", etc.
  message?: string;               // Human-readable status
  device?: string;                // "mps", "cuda", "cpu"
  result?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
    video_path?: string;
    audio_path?: string;
    duration_seconds?: number;
    duration?: number;
    music?: boolean;
    file_size?: number;
    video_url?: string;
    provider?: string;
    [key: string]: any;
  };
  metadata?: {
    model?: string;
    device?: string;
    processing_time_ms?: number;
    [key: string]: any;
  };
  timestamp?: number;
  error?: string;
  scene_id?: number;
  text?: string;
}

type BridgeCallback = (msg: BridgeMessage) => void;

/**
 * BridgeService - Client-side WebSocket manager
 * Handles connection lifecycle and message routing
 */
class BridgeServiceImpl {
  private socket: WebSocket | null = null;
  private callbacks: Set<BridgeCallback> = new Set();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // ms
  private url = 'ws://localhost:8000/ws/bridge';
  private voiceRoutingConfig: VoiceRoutingConfig;

  constructor() {
    const elevenlabsEnabled = (import.meta.env.VITE_ELEVENLABS_ENABLED || '').toLowerCase() === 'true';
    this.voiceRoutingConfig = {
      elevenlabsEnabled,
      defaultVoiceProvider: this._determineDefaultProvider(elevenlabsEnabled),
      fallbackEnabled: true
    };

    console.log('[BridgeService] Voice Routing Configured:', {
      elevenlabsEnabled: this.voiceRoutingConfig.elevenlabsEnabled,
      defaultProvider: this.voiceRoutingConfig.defaultVoiceProvider,
      fallbackEnabled: this.voiceRoutingConfig.fallbackEnabled
    });
  }

  /**
   * Connect to the Neural Engine
   */
  connect(url?: string): void {
    if (this.isConnected) {
      console.log('🟢 Already connected to Bridge');
      return;
    }

    if (url) {
      this.url = url;
    }

    try {
      console.log(`🌉 [Bridge] Connecting to ${this.url}...`);

      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('🟢 [Bridge] Connected to Neural Engine');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notify({
          status: 'idle',
          message: 'Connected to M2 Pro Neural Engine',
          device: 'mps'
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as BridgeMessage;
          this.notify(data);
        } catch (e) {
          console.error('[Bridge] Failed to parse message:', e);
          this.notify({
            status: 'error',
            message: 'Failed to parse bridge message'
          });
        }
      };

      this.socket.onclose = () => {
        console.log('🔴 [Bridge] Disconnected from Neural Engine');
        this.isConnected = false;
        this.notify({
          status: 'disconnected',
          message: 'Bridge disconnected'
        });

        // Attempt reconnect
        this.attemptReconnect();
      };

      this.socket.onerror = (event) => {
        console.error('⚠️  [Bridge] WebSocket error:', event);
        this.notify({
          status: 'error',
          message: 'WebSocket connection error'
        });
      };

    } catch (e) {
      console.error('[Bridge] Connection failed:', e);
      this.notify({
        status: 'error',
        message: `Connection failed: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }

  /**
   * Disconnect from Neural Engine
   */
  disconnect(): void {
    if (this.socket) {
      console.log('🔌 [Bridge] Disconnecting...');
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Subscribe to bridge messages
   * Returns unsubscribe function
   */
  subscribe(callback: BridgeCallback): () => void {
    this.callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Check if connected to bridge
   */
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection URL
   */
  getURL(): string {
    return this.url;
  }

  /**
   * Get voice routing status
   */
  getVoiceRoutingStatus(): {
    defaultProvider: 'elevenlabs' | 'pyttsx3';
    elevenlabsAvailable: boolean;
    fallbackEnabled: boolean;
  } {
    return {
      defaultProvider: this.voiceRoutingConfig.defaultVoiceProvider,
      elevenlabsAvailable: this.voiceRoutingConfig.elevenlabsEnabled,
      fallbackEnabled: this.voiceRoutingConfig.fallbackEnabled
    };
  }

  // --- VOICE ROUTING METHODS ---

  /**
   * Determine default voice provider based on available configuration
   */
  private _determineDefaultProvider(elevenlabsEnabled: boolean): 'elevenlabs' | 'pyttsx3' {
    return elevenlabsEnabled ? 'elevenlabs' : 'pyttsx3';
  }

  /**
   * Select which voice provider to use based on request and availability
   */
  private _selectProvider(requested?: 'elevenlabs' | 'pyttsx3' | 'auto'): 'elevenlabs' | 'pyttsx3' {
    if (requested === 'auto') {
      return this.voiceRoutingConfig.defaultVoiceProvider;
    }

    if (requested === 'elevenlabs') {
      if (this.voiceRoutingConfig.elevenlabsEnabled) {
        return 'elevenlabs';
      }
      if (this.voiceRoutingConfig.fallbackEnabled) {
        console.warn('[BridgeService] ElevenLabs requested but not configured, falling back to pyttsx3');
        return 'pyttsx3';
      }
      throw new Error('ElevenLabs not configured and fallback disabled');
    }

    // Default to pyttsx3
    return 'pyttsx3';
  }

  /**
   * Generate voiceover via route to appropriate provider
   * Enhanced wrapper for TTS generation with intelligent provider selection
   */
  generateVoiceover(
    sceneId: number,
    text: string,
    provider?: 'elevenlabs' | 'pyttsx3' | 'auto',
    voiceModelId?: string
  ): Promise<{ audioPath: string; duration: number; provider: string }> {
    if (!INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE) {
      return this._generateViaBrowserSpeech(sceneId, text);
    }

    // Determine which provider to use
    const selectedProvider = this._selectProvider(provider);

    console.log(`[BridgeService] Generating voiceover (scene ${sceneId}):`, {
      provider: selectedProvider,
      textLength: text.length,
      voiceModel: voiceModelId || 'default'
    });

    // Route to appropriate backend handler
    if (selectedProvider === 'elevenlabs') {
      return this._generateViaElevenLabs(sceneId, text, voiceModelId);
    } else {
      return this._generateViaPyttsx3(sceneId, text);
    }
  }

  private async _generateViaBrowserSpeech(
    sceneId: number,
    text: string
  ): Promise<{ audioPath: string; duration: number; provider: string }> {
    console.log(`[BridgeService] Native browser speech fallback (scene ${sceneId})`);

    // Fire-and-forget playback for immediate audible feedback.
    // If speech output is blocked by browser policy, we still return a WAV asset URL.
    void nativeVoiceService.speakText(text).catch((error) => {
      console.warn('[BridgeService] speechSynthesis playback failed:', error);
    });

    const asset = await nativeVoiceService.createVoiceAsset(text);
    return {
      audioPath: asset.audioUrl,
      duration: asset.durationSec,
      provider: 'browser-speech',
    };
  }

  /**
   * Generate voiceover via ElevenLabs API (through Python backend)
   */
  private _generateViaElevenLabs(
    sceneId: number,
    text: string,
    voiceModelId?: string
  ): Promise<{ audioPath: string; duration: number; provider: string }> {
    return new Promise((resolve, reject) => {
      const request = {
        action: 'GENERATE_SPEECH_ELEVENLABS',
        scene_id: sceneId,
        text: text,
        voice_model_id: voiceModelId || 'default'
      };

      const requestHandler = (response: BridgeMessage) => {
        if (response.status === 'complete' && response.result?.audio_path) {
          resolve({
            audioPath: response.result.audio_path,
            duration: response.result.duration || 0,
            provider: 'elevenlabs'
          });
        } else if (response.status === 'error') {
          console.error('[BridgeService] ElevenLabs error:', response.error);
          if (this.voiceRoutingConfig.fallbackEnabled) {
            // Fallback to pyttsx3
            console.warn('[BridgeService] Falling back to pyttsx3');
            this._generateViaPyttsx3(sceneId, text)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(response.error || 'ElevenLabs TTS failed'));
          }
        }
      };

      // Set up listener for this specific request
      const unsubscribe = this.subscribe(requestHandler);

      // Send request
      this.send(request);

      // Clean up listener after 30 seconds timeout
      setTimeout(() => {
        unsubscribe();
        reject(new Error('Voiceover generation timeout'));
      }, 30000);
    });
  }

  /**
   * Generate voiceover via pyttsx3 (Mac Neural TTS)
   */
  private _generateViaPyttsx3(
    sceneId: number,
    text: string
  ): Promise<{ audioPath: string; duration: number; provider: string }> {
    return new Promise((resolve, reject) => {
      const request = {
        action: 'GENERATE_SPEECH',
        scene_id: sceneId,
        text: text
      };

      const requestHandler = (response: BridgeMessage) => {
        if (response.status === 'complete' && response.result?.audio_path) {
          resolve({
            audioPath: response.result.audio_path,
            duration: response.result.duration || 0,
            provider: 'pyttsx3'
          });
        } else if (response.status === 'error') {
          reject(new Error(response.error || 'TTS generation failed'));
        }
      };

      // Set up listener for this specific request
      const unsubscribe = this.subscribe(requestHandler);

      // Send request
      this.send(request);

      // Clean up listener after 30 seconds timeout
      setTimeout(() => {
        unsubscribe();
        reject(new Error('Voiceover generation timeout'));
      }, 30000);
    });
  }

  /**
   * Generate intro video via VideoEngine SFS
   */
  generateIntro(
    prompt: string,
    style: 'cinematic' | 'abstract' | 'minimal' | 'energetic',
    duration: number,
    effects: 'none' | 'minimal' | 'all'
  ): Promise<{ videoPath: string; duration: number; music: boolean }> {
    return new Promise((resolve, reject) => {
      const request = {
        action: 'GENERATE_INTRO',
        prompt: prompt,
        style: style,
        duration: duration,
        effects: effects
      };

      const requestHandler = (response: BridgeMessage) => {
        if (response.status === 'complete' && response.result?.video_path) {
          resolve({
            videoPath: response.result.video_path,
            duration: response.result.duration || duration,
            music: response.result.music || false
          });
        } else if (response.status === 'error') {
          reject(new Error(response.error || 'Intro generation failed'));
        }
      };

      // Set up listener
      const unsubscribe = this.subscribe(requestHandler);

      // Send request
      this.send(request);

      // Clean up listener after 60 seconds timeout
      setTimeout(() => {
        unsubscribe();
        reject(new Error('Intro generation timeout'));
      }, 60000);
    });
  }

  /**
   * Assemble hybrid demo (intro + main video + credits)
   */
  assembleHybridDemo(
    mainVideoPath: string,
    introVideoPath: string | null,
    audioPaths: string[],
    outputName: string,
    postProduction?: any
  ): Promise<{ videoUrl: string; videoPath: string; fileSize: number }> {
    return new Promise((resolve, reject) => {
      const request = {
        action: 'ASSEMBLE_HYBRID_DEMO',
        main_video_path: mainVideoPath,
        intro_video_path: introVideoPath,
        audio_paths: audioPaths,
        output_name: outputName,
        post_production: postProduction || {}
      };

      const requestHandler = (response: BridgeMessage) => {
        if (response.status === 'complete') {
          resolve({
            videoUrl: response.result?.video_url || '',
            videoPath: response.result?.video_path || '',
            fileSize: response.result?.file_size || 0
          });
        } else if (response.status === 'error') {
          reject(new Error(response.error || 'Assembly failed'));
        }
      };

      // Set up listener
      const unsubscribe = this.subscribe(requestHandler);

      // Send request
      this.send(request);

      // Clean up listener after 120 seconds timeout
      setTimeout(() => {
        unsubscribe();
        reject(new Error('Assembly timeout'));
      }, 120000);
    });
  }

  // --- COMMANDS ---

  /**
   * Send audio to neural engine for stem separation
   * Demucs will separate into: vocals, drums, bass, other
   */
  separateAudio(filename: string, audioData?: string): void {
    const payload = {
      action: 'SEPARATE_AUDIO',
      filename,
      ...(audioData && { audio_data: audioData })
    };
    this.send(payload);
  }

  /**
   * Generate visual scene based on audio analysis
   * Uses Echo Cinema (video generation model)
   */
  generateScene(prompt: string, audioPath?: string): void {
    const payload = {
      action: 'GENERATE_SCENE',
      prompt,
      ...(audioPath && { audio_path: audioPath })
    };
    this.send(payload);
  }

  /**
   * Health check - verify bridge is online
   */
  healthCheck(): void {
    this.send({ action: 'HEALTH_CHECK' });
  }

  /**
   * Stream video blob to backend for Sovereign Screen Recorder
   * Sends video data in chunks to avoid memory overload
   */
  async streamVideoToBridge(
    videoBlob: Blob,
    demoName: string,
    onProgress?: (progress: number) => void
  ): Promise<{ videoPath: string; duration: number }> {
    const result = await this.saveVideoRecording(
      videoBlob,
      demoName,
      256 * 1024,
      onProgress
    );

    return {
      videoPath: result.videoPath,
      duration: result.duration,
    };
  }

  /**
   * Stream video chunks in smaller pieces (for very large videos)
   * Sends up to 256KB at a time to avoid timeout
   */
  async streamVideoChunked(
    videoBlob: Blob,
    demoName: string,
    chunkSize: number = 256 * 1024, // 256KB chunks
    onProgress?: (bytesWritten: number, totalBytes: number) => void
  ): Promise<{ videoPath: string; duration: number }> {
    const result = await this.saveVideoRecording(
      videoBlob,
      demoName,
      chunkSize,
      onProgress
        ? (percent) => onProgress(Math.round((percent / 100) * videoBlob.size), videoBlob.size)
        : undefined
    );

    return {
      videoPath: result.videoPath,
      duration: result.duration,
    };
  }

  /**
   * Save an uploaded audio blob to bridge storage and return filesystem path.
   * This is used by SFS Video Engine before hybrid assembly.
   */
  async saveAudioFile(
    audioBlob: Blob,
    filename: string
  ): Promise<{ audioPath: string; duration: number }> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = (reader.result as string).split(',')[1];
          const request = {
            action: 'SAVE_AUDIO_FILE',
            file_name: filename,
            mime_type: audioBlob.type,
            audio_data: base64Data,
            file_size: audioBlob.size,
          };

          const unsubscribe = this.subscribe((response: BridgeMessage) => {
            if (response.status === 'complete' && response.result?.audio_path) {
              unsubscribe();
              resolve({
                audioPath: response.result.audio_path,
                duration: response.result.duration || 0,
              });
            } else if (response.status === 'error') {
              unsubscribe();
              reject(new Error(response.error || response.message || 'Audio save failed'));
            }
          });

          this.send(request);
          setTimeout(() => {
            unsubscribe();
            reject(new Error('Audio save timeout'));
          }, 60000);
        };

        reader.onerror = () => reject(new Error('Failed to read audio blob'));
        reader.readAsDataURL(audioBlob);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Save an uploaded video blob to bridge storage and return filesystem path.
   */
  async saveVideoFile(
    videoBlob: Blob,
    filename: string
  ): Promise<{ videoPath: string; duration: number; videoUrl?: string }> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = (reader.result as string).split(',')[1];
          const request = {
            action: 'SAVE_VIDEO_FILE',
            file_name: filename,
            mime_type: videoBlob.type,
            video_data: base64Data,
            file_size: videoBlob.size,
          };

          const unsubscribe = this.subscribe((response: BridgeMessage) => {
            if (response.status === 'complete' && response.action === 'SAVE_VIDEO_FILE' && response.result?.video_path) {
              unsubscribe();
              resolve({
                videoPath: response.result.video_path,
                videoUrl: response.result.video_url,
                duration: response.result.duration || 0,
              });
            } else if (response.status === 'error') {
              unsubscribe();
              reject(new Error(response.error || response.message || 'Video save failed'));
            }
          });

          this.send(request);
          setTimeout(() => {
            unsubscribe();
            reject(new Error('Video save timeout'));
          }, 60000);
        };

        reader.onerror = () => reject(new Error('Failed to read video blob'));
        reader.readAsDataURL(videoBlob);
      } catch (error) {
        reject(error);
      }
    });
  }

  async extractVideoAudio(
    inputVideoPath: string,
    outputName: string,
    onEvent?: (event: { percent?: number; message?: string }) => void
  ): Promise<{ audioPath: string; audioUrl?: string }> {
    const requestId = `extract-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!this.getIsConnected()) {
      this.connect();
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe((response: BridgeMessage & { action?: string; request_id?: string }) => {
        if (response.action !== 'EXTRACT_VIDEO_AUDIO' || response.request_id !== requestId) {
          return;
        }

        if (response.status === 'processing' || response.status === 'loading') {
          onEvent?.({ percent: response.progress, message: response.message || response.stage });
          return;
        }

        if (response.status === 'complete' && response.result?.audio_path) {
          unsubscribe();
          resolve({
            audioPath: response.result.audio_path,
            audioUrl: response.result.audio_url,
          });
          return;
        }

        if (response.status === 'error') {
          unsubscribe();
          reject(new Error(response.error || response.message || 'EXTRACT_VIDEO_AUDIO failed'));
        }
      });

      this.send({
        action: 'EXTRACT_VIDEO_AUDIO',
        request_id: requestId,
        input_video: inputVideoPath,
        output_name: outputName,
      });

      setTimeout(() => {
        unsubscribe();
        reject(new Error('EXTRACT_VIDEO_AUDIO timeout'));
      }, 180000);
    });
  }

  async cleanupDialogueVideo(
    params: {
      inputVideoPath: string;
      outputPath: string;
      cleanupInstruction?: string;
      cleanupMode: 'dialogue-focus' | 'balanced';
      useStemIsolation: boolean;
      backgroundReductionDb: number;
      noiseReductionStrength: number;
      restorationTools: {
        highpass: boolean;
        highpassHz: number;
        lowpass: boolean;
        lowpassHz: number;
        denoiseFft: boolean;
        denoiseFftAmount: number;
        denoiseNlm: boolean;
        denoiseNlmStrength: number;
        declick: boolean;
        declip: boolean;
        deesser: boolean;
        deesserAmount: number;
        dehum: boolean;
        dehumFrequencyHz: number;
        dehumHarmonics: number;
        dynamicEq: boolean;
        dynamicEqFrequencyHz: number;
        dynamicEqRangeDb: number;
        speechLevel: boolean;
        compress: boolean;
        compressThresholdDb: number;
        compressRatio: number;
        gate: boolean;
        gateThresholdDb: number;
        gateRatio: number;
        trimSilence: boolean;
        trimSilenceThresholdDb: number;
        limiter: boolean;
        limiterCeilingDb: number;
      };
    },
    onEvent?: (event: { percent?: number; message?: string }) => void
  ): Promise<{ videoPath: string; videoUrl?: string; cleanedAudioPath?: string; cleanedAudioUrl?: string }> {
    const requestId = `dialogue-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!this.getIsConnected()) {
      this.connect();
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe((response: BridgeMessage & { action?: string; request_id?: string }) => {
        if (response.action !== 'CLEANUP_DIALOGUE_VIDEO' || response.request_id !== requestId) {
          return;
        }

        if (response.status === 'processing' || response.status === 'loading' || response.status === 'rendering') {
          onEvent?.({ percent: response.progress, message: response.message || response.stage });
          return;
        }

        if (response.status === 'complete' && response.result?.video_path) {
          unsubscribe();
          resolve({
            videoPath: response.result.video_path,
            videoUrl: response.result.video_url,
            cleanedAudioPath: response.result.cleaned_audio_path,
            cleanedAudioUrl: response.result.cleaned_audio_url,
          });
          return;
        }

        if (response.status === 'error') {
          unsubscribe();
          reject(new Error(response.error || response.message || 'CLEANUP_DIALOGUE_VIDEO failed'));
        }
      });

      this.send({
        action: 'CLEANUP_DIALOGUE_VIDEO',
        request_id: requestId,
        input_video: params.inputVideoPath,
        output_path: params.outputPath,
        cleanup_instruction: params.cleanupInstruction || '',
        cleanup_mode: params.cleanupMode,
        use_stem_isolation: params.useStemIsolation,
        background_reduction_db: params.backgroundReductionDb,
        noise_reduction_strength: params.noiseReductionStrength,
        restoration_tools: {
          highpass: params.restorationTools.highpass,
          highpass_hz: params.restorationTools.highpassHz,
          lowpass: params.restorationTools.lowpass,
          lowpass_hz: params.restorationTools.lowpassHz,
          denoise_fft: params.restorationTools.denoiseFft,
          denoise_fft_amount: params.restorationTools.denoiseFftAmount,
          denoise_nlm: params.restorationTools.denoiseNlm,
          denoise_nlm_strength: params.restorationTools.denoiseNlmStrength,
          declick: params.restorationTools.declick,
          declip: params.restorationTools.declip,
          deesser: params.restorationTools.deesser,
          deesser_amount: params.restorationTools.deesserAmount,
          dehum: params.restorationTools.dehum,
          dehum_frequency_hz: params.restorationTools.dehumFrequencyHz,
          dehum_harmonics: params.restorationTools.dehumHarmonics,
          dynamic_eq: params.restorationTools.dynamicEq,
          dynamic_eq_frequency_hz: params.restorationTools.dynamicEqFrequencyHz,
          dynamic_eq_range_db: params.restorationTools.dynamicEqRangeDb,
          speech_level: params.restorationTools.speechLevel,
          compress: params.restorationTools.compress,
          compress_threshold_db: params.restorationTools.compressThresholdDb,
          compress_ratio: params.restorationTools.compressRatio,
          gate: params.restorationTools.gate,
          gate_threshold_db: params.restorationTools.gateThresholdDb,
          gate_ratio: params.restorationTools.gateRatio,
          trim_silence: params.restorationTools.trimSilence,
          trim_silence_threshold_db: params.restorationTools.trimSilenceThresholdDb,
          limiter: params.restorationTools.limiter,
          limiter_ceiling_db: params.restorationTools.limiterCeilingDb,
        },
      });

      setTimeout(() => {
        unsubscribe();
        reject(new Error('CLEANUP_DIALOGUE_VIDEO timeout'));
      }, 300000);
    });
  }

  /**
   * Run root-level video-system.py through bridge backend.
   * Maps UI values to canonical CLI args:
   * --audio --prompt --style --reactivity --output
   */
  async runSfsVideoSystem(
    params: {
      mode?: 'generate' | 'edit';
      audioPath?: string;
      inputVideo?: string;
      prompt?: string;
      style?: 'Noir' | 'Glitch' | 'Cinematic' | 'Abstract';
      reactivity?: number;
      outputPath: string;
      textOverlay?: string;
      colorGrade?: string;
      scenes?: Array<{
        id: string;
        startTime: number;
        endTime: number;
        style: 'Noir' | 'Glitch' | 'Cinematic' | 'Abstract';
        prompt: string;
        reactivity: number;
        caption?: string;
      }>;
    },
    onEvent?: (event: { percent?: number; message?: string }) => void
  ): Promise<{ videoPath: string; videoUrl?: string }> {
    const requestId = `sfs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!this.getIsConnected()) {
      this.connect();
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe((response: BridgeMessage & { action?: string; request_id?: string }) => {
        if (response.action !== 'RUN_VIDEO_SYSTEM' || response.request_id !== requestId) {
          return;
        }

        if (response.status === 'processing' || response.status === 'rendering' || response.status === 'loading') {
          if (onEvent) {
            onEvent({
              percent: response.progress,
              message: response.message || response.stage,
            });
          }
          return;
        }

        if (response.status === 'complete' && response.result?.video_path) {
          unsubscribe();
          resolve({
            videoPath: response.result.video_path,
            videoUrl: response.result.video_url,
          });
          return;
        }

        if (response.status === 'error') {
          unsubscribe();
          reject(new Error(response.error || response.message || 'RUN_VIDEO_SYSTEM failed'));
        }
      });

      this.send({
        action: 'RUN_VIDEO_SYSTEM',
        request_id: requestId,
        mode: params.mode || 'generate',
        audio_path: params.audioPath,
        input_video: params.inputVideo,
        prompt: params.prompt,
        style: params.style,
        reactivity: params.reactivity,
        output_path: params.outputPath,
        text_overlay: params.textOverlay,
        color_grade: params.colorGrade,
        scenes: params.scenes,
      });

      setTimeout(() => {
        unsubscribe();
        reject(new Error('RUN_VIDEO_SYSTEM timeout'));
      }, 240000);
    });
  }

  /**
   * Run root-level music-system.py through bridge backend.
   * Canonical args:
   * --voice --style --tempo --output
   */
  async runMusicSystem(
    params: {
      voicePath?: string;
      takePaths?: string[];
      style: string;
      tempo?: number;
      lyrics?: string;
      voiceId?: string;
      instrumental?: boolean;
      songTitle?: string;
      outputPath: string;
      inputAudioPath?: string;
      startTime?: number;
      licenseTier?: string;
      username?: string;
      vocalTexture?: 'none' | 'gospel_choir' | 'rn_b_silk' | 'gritty_soul';
      enableHonestTuner?: boolean;
      tunerKey?: string;
      tunerScale?: 'major' | 'minor' | 'chromatic';
      tunerStrength?: number;
      enableSmartComping?: boolean;
      compingSegmentMs?: number;
    },
    onEvent?: (event: { percent?: number; message?: string }) => void
  ): Promise<{
    songPath: string;
    songUrl?: string;
    vocalsPath?: string;
    vocalsUrl?: string;
    instrumentalPath?: string;
    instrumentalUrl?: string;
    coverArtPath?: string;
    coverArtUrl?: string;
  }> {
    const requestId = `music-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!this.getIsConnected()) {
      this.connect();
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe((response: BridgeMessage & { action?: string; request_id?: string }) => {
        if (response.action !== 'RUN_MUSIC_SYSTEM' || response.request_id !== requestId) {
          return;
        }

        if (response.status === 'processing' || response.status === 'rendering' || response.status === 'loading') {
          if (onEvent) {
            onEvent({
              percent: response.progress,
              message: response.message || response.stage,
            });
          }
          return;
        }

        if (response.status === 'complete' && response.result?.song_path) {
          unsubscribe();
          resolve({
            songPath: response.result.song_path,
            songUrl: response.result.song_url,
            vocalsPath: response.result.vocals_path,
            vocalsUrl: response.result.vocals_url,
            instrumentalPath: response.result.instrumental_path,
            instrumentalUrl: response.result.instrumental_url,
            coverArtPath: response.result.cover_art_path,
            coverArtUrl: response.result.cover_art_url,
          });
          return;
        }

        if (response.status === 'error') {
          unsubscribe();
          reject(new Error(response.error || response.message || 'RUN_MUSIC_SYSTEM failed'));
        }
      });

      this.send({
        action: 'RUN_MUSIC_SYSTEM',
        request_id: requestId,
        voice_path: params.voicePath || '',
        style: params.style,
        tempo: params.tempo ?? 120,
        lyrics: params.lyrics ?? '',
        voice_id: params.voiceId ?? '',
        instrumental: !!params.instrumental,
        song_title: params.songTitle ?? '',
        output_path: params.outputPath,
        input_audio: params.inputAudioPath ?? '',
        start_time: Number.isFinite(params.startTime) ? params.startTime : undefined,
        license_tier: params.licenseTier ?? '',
        username: params.username ?? '',
        vocal_texture: params.vocalTexture ?? 'none',
        enable_honest_tuner: !!params.enableHonestTuner,
        tuner_key: params.tunerKey ?? 'C',
        tuner_scale: params.tunerScale ?? 'chromatic',
        tuner_strength: Number.isFinite(params.tunerStrength) ? params.tunerStrength : 18,
        enable_smart_comping: !!params.enableSmartComping,
        comping_segment_ms: Number.isFinite(params.compingSegmentMs) ? params.compingSegmentMs : 420,
        take_paths: params.takePaths ?? [],
      });

      setTimeout(() => {
        unsubscribe();
        reject(new Error('RUN_MUSIC_SYSTEM timeout'));
      }, 240000);
    });
  }

  /**
   * Save video via chunked stream then finalize to MP4.
   * Uses SAVE_SCREEN_RECORDING_CHUNK + FINALIZE_RECORDING actions.
   */
  async saveVideoRecording(
    videoBlob: Blob,
    demoId: string,
    chunkSize: number = 256 * 1024,
    onProgress?: (percent: number) => void
  ): Promise<{ videoPath: string; videoUrl?: string; duration: number }> {
    if (!this.getIsConnected()) {
      this.connect();
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const totalChunks = Math.ceil(videoBlob.size / chunkSize);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, videoBlob.size);
      const chunk = videoBlob.slice(start, end);
      const isLastChunk = i === totalChunks - 1;

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Failed to read video chunk'));
        reader.readAsDataURL(chunk);
      });

      await new Promise<void>((resolve, reject) => {
        const request = {
          action: 'SAVE_SCREEN_RECORDING_CHUNK',
          demo_id: demoId,
          chunk_index: i,
          chunk_data: base64Data,
          is_last: isLastChunk,
          total_chunks: totalChunks,
        };

        const unsubscribe = this.subscribe((response: BridgeMessage) => {
          if (response.status === 'processing' || response.status === 'complete') {
            unsubscribe();
            if (onProgress) {
              onProgress(Math.round(((i + 1) / totalChunks) * 80));
            }
            resolve();
          } else if (response.status === 'error') {
            unsubscribe();
            reject(new Error(response.error || response.message || `Chunk ${i} failed`));
          }
        });

        this.send(request);
        setTimeout(() => {
          unsubscribe();
          reject(new Error(`Chunk ${i + 1} timeout`));
        }, 60000);
      });
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe((response: BridgeMessage) => {
        if (response.status === 'complete' && response.result?.video_path) {
          unsubscribe();
          if (onProgress) onProgress(100);
          resolve({
            videoPath: response.result.video_path,
            videoUrl: response.result.video_url,
            duration: response.result.duration || 0,
          });
        } else if (response.status === 'error') {
          unsubscribe();
          reject(new Error(response.error || response.message || 'Video finalize failed'));
        }
      });

      this.send({
        action: 'FINALIZE_RECORDING',
        demo_id: demoId,
      });

      setTimeout(() => {
        unsubscribe();
        reject(new Error('Video finalize timeout'));
      }, 180000);
    });
  }

  // --- PRIVATE ---

  private send(payload: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[Bridge] Socket not ready. Current state:', this.socket?.readyState);
      this.notify({
        status: 'error',
        message: 'Bridge not connected. Call bridge.connect() first.'
      });
      return;
    }

    try {
      const message = JSON.stringify(payload);
      this.socket.send(message);
      console.log('[Bridge] Sent:', payload.action);
    } catch (e) {
      console.error('[Bridge] Send error:', e);
      this.notify({
        status: 'error',
        message: `Send failed: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }

  private notify(msg: BridgeMessage): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(msg);
      } catch (e) {
        console.error('[Bridge] Callback error:', e);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Bridge] Max reconnection attempts reached');
      this.notify({
        status: 'error',
        message: `Failed to reconnect after ${this.maxReconnectAttempts} attempts`
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Bridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }
}

/**
 * Singleton instance
 */
export const bridge = new BridgeServiceImpl();

export default bridge;
