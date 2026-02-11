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
  elevenlabsApiKey?: string;
  defaultVoiceProvider: 'elevenlabs' | 'pyttsx3';
  fallbackEnabled: boolean;
}

export interface BridgeMessage {
  status: BridgeStatus;
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
    // Initialize voice routing based on environment
    this.voiceRoutingConfig = {
      elevenlabsEnabled: !!import.meta.env.VITE_ELEVENLABS_KEY,
      elevenlabsApiKey: import.meta.env.VITE_ELEVENLABS_KEY,
      defaultVoiceProvider: this._determineDefaultProvider(),
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
  private _determineDefaultProvider(): 'elevenlabs' | 'pyttsx3' {
    // Priority: ElevenLabs > pyttsx3
    if (import.meta.env.VITE_ELEVENLABS_KEY) {
      return 'elevenlabs';
    }
    return 'pyttsx3';
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
        voice_model_id: voiceModelId || 'default',
        api_key: this.voiceRoutingConfig.elevenlabsApiKey
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
    return new Promise((resolve, reject) => {
      try {
        // Read blob as base64 for JSON transmission
        const reader = new FileReader();

        reader.onload = () => {
          const base64Data = (reader.result as string).split(',')[1]; // Remove data: URL prefix

          const request = {
            action: 'SAVE_SCREEN_RECORDING',
            demo_name: demoName,
            video_data: base64Data,
            mime_type: videoBlob.type,
            file_size: videoBlob.size
          };

          const requestHandler = (response: BridgeMessage) => {
            if (response.status === 'complete' && response.result?.video_path) {
              resolve({
                videoPath: response.result.video_path,
                duration: response.result.duration || 0
              });
            } else if (response.status === 'error') {
              reject(new Error(response.error || 'Video save failed'));
            }
          };

          const unsubscribe = this.subscribe(requestHandler);
          this.send(request);

          setTimeout(() => {
            unsubscribe();
            reject(new Error('Video streaming timeout'));
          }, 180000); // 3 minute timeout
        };

        reader.onerror = () => {
          reject(new Error('Failed to read video blob'));
        };

        reader.readAsDataURL(videoBlob);

      } catch (error) {
        reject(error);
      }
    });
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
    return new Promise(async (resolve, reject) => {
      try {
        const totalChunks = Math.ceil(videoBlob.size / chunkSize);
        let bytesWritten = 0;

        console.log(`[BridgeService] Starting chunked video stream: ${totalChunks} chunks of ${chunkSize} bytes`);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, videoBlob.size);
          const chunk = videoBlob.slice(start, end);

          const isLastChunk = i === totalChunks - 1;

          // Convert chunk to base64
          const base64Data = await new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => {
              res((reader.result as string).split(',')[1]);
            };
            reader.onerror = rej;
            reader.readAsDataURL(chunk);
          });

          // Send chunk
          const request = {
            action: 'SAVE_SCREEN_RECORDING_CHUNK',
            demo_name: demoName,
            chunk_index: i,
            chunk_data: base64Data,
            is_last: isLastChunk,
            total_chunks: totalChunks
          };

          await new Promise<void>((res) => {
            const unsubscribe = this.subscribe((response: BridgeMessage) => {
              if (response.status === 'complete' || response.status === 'processing') {
                unsubscribe();
                bytesWritten = end;

                if (onProgress) {
                  onProgress(bytesWritten, videoBlob.size);
                }

                res();
              } else if (response.status === 'error') {
                unsubscribe();
                rej(new Error(response.error || 'Chunk save failed'));
              }
            });

            this.send(request);

            // Timeout per chunk
            setTimeout(() => {
              unsubscribe();
              rej(new Error(`Chunk ${i} timeout`));
            }, 60000);
          });

          console.log(`[BridgeService] Chunk ${i + 1}/${totalChunks} sent (${bytesWritten} / ${videoBlob.size} bytes)`);
        }

        // Wait for finalization
        resolve({
          videoPath: `/tmp/screen_recordings/${demoName}/recording.webm`,
          duration: Math.floor(videoBlob.size / 100000) // Rough estimate
        });

      } catch (error) {
        reject(error);
      }
    });
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
