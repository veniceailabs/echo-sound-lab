/**
 * BRIDGE SERVICE UPGRADE - INTELLIGENT VOICE ROUTING
 *
 * This is a REFERENCE IMPLEMENTATION showing how to extend BridgeService
 * with intelligent voice routing for the Hybrid Demo Director.
 *
 * Integration Steps:
 * 1. Copy this logic into src/services/BridgeService.ts
 * 2. Update echo-bridge/server.py with new action handlers
 * 3. Configure environment variables for voice providers
 *
 * Environment Variables:
 * - ELEVENLABS_API_KEY: ElevenLabs API key (optional)
 * - ELEVENLABS_VOICE_ID: Default ElevenLabs voice ID (optional)
 * - USE_PYTTSX3_FALLBACK: true (default) or false
 */

// Add to BridgeService class:

interface VoiceRoutingConfig {
  elevenlabsEnabled: boolean;
  defaultVoiceProvider: 'elevenlabs' | 'pyttsx3';
  fallbackEnabled: boolean;
}

class BridgeServiceVoiceRouting {
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
   * Determine default voice provider based on available configuration
   */
  private _determineDefaultProvider(elevenlabsEnabled: boolean): 'elevenlabs' | 'pyttsx3' {
    return elevenlabsEnabled ? 'elevenlabs' : 'pyttsx3';
  }

  /**
   * Route TTS generation to appropriate provider
   * Enhanced version of existing _requestTTS method
   */
  async generateVoiceover(
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
   * Select which voice provider to use
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
   * Generate voiceover via ElevenLabs API (through Python backend)
   */
  private async _generateViaElevenLabs(
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

      // Send to Python backend
      // Existing bridge.send() handles WebSocket delivery
      const requestHandler = (response: any) => {
        if (response.status === 'complete' && response.audio_path) {
          resolve({
            audioPath: response.audio_path,
            duration: response.duration || 0,
            provider: 'elevenlabs'
          });
        } else if (response.status === 'error') {
          console.error('[BridgeService] ElevenLabs error:', response.message);
          if (this.voiceRoutingConfig.fallbackEnabled) {
            // Fallback to pyttsx3
            console.warn('[BridgeService] Falling back to pyttsx3');
            this._generateViaPyttsx3(sceneId, text)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(response.message));
          }
        }
      };

      // Use existing bridge.send() method
      // bridge.send(request, requestHandler);
    });
  }

  /**
   * Generate voiceover via pyttsx3 (Mac Neural TTS)
   */
  private async _generateViaPyttsx3(
    sceneId: number,
    text: string
  ): Promise<{ audioPath: string; duration: number; provider: string }> {
    return new Promise((resolve, reject) => {
      const request = {
        action: 'GENERATE_SPEECH',
        scene_id: sceneId,
        text: text
      };

      const requestHandler = (response: any) => {
        if (response.status === 'complete' && response.audio_path) {
          resolve({
            audioPath: response.audio_path,
            duration: response.duration || 0,
            provider: 'pyttsx3'
          });
        } else if (response.status === 'error') {
          reject(new Error(response.message || 'TTS generation failed'));
        }
      };

      // Use existing bridge.send() method
      // bridge.send(request, requestHandler);
    });
  }

  /**
   * Generate intro video via VideoEngine SFS
   */
  async generateIntro(
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

      const requestHandler = (response: any) => {
        if (response.status === 'complete' && response.video_path) {
          resolve({
            videoPath: response.video_path,
            duration: response.duration || duration,
            music: response.music || false
          });
        } else if (response.status === 'error') {
          reject(new Error(response.message || 'Intro generation failed'));
        }
      };

      // Use existing bridge.send() method
      // bridge.send(request, requestHandler);
    });
  }

  /**
   * Assemble hybrid demo (intro + main video + credits)
   */
  async assembleHybridDemo(
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

      const requestHandler = (response: any) => {
        if (response.status === 'complete') {
          resolve({
            videoUrl: response.video_url,
            videoPath: response.video_path,
            fileSize: response.file_size
          });
        } else if (response.status === 'error') {
          reject(new Error(response.message || 'Assembly failed'));
        }
      };

      // Use existing bridge.send() method
      // bridge.send(request, requestHandler);
    });
  }

  /**
   * Get current voice routing status
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
}

/**
 * HOW TO INTEGRATE INTO EXISTING BridgeService:
 *
 * 1. Add VoiceRoutingConfig interface to BridgeService.ts
 *
 * 2. Add these properties to BridgeService class:
 *    private voiceRoutingConfig: VoiceRoutingConfig;
 *
 * 3. Add these methods to BridgeService class:
 *    - _determineDefaultProvider()
 *    - generateVoiceover()
 *    - _selectProvider()
 *    - _generateViaElevenLabs()
 *    - _generateViaPyttsx3()
 *    - generateIntro()
 *    - assembleHybridDemo()
 *    - getVoiceRoutingStatus()
 *
 * 4. In BridgeService constructor, add:
 *    this.voiceRoutingConfig = {
 *      elevenlabsEnabled: (import.meta.env.VITE_ELEVENLABS_ENABLED || '').toLowerCase() === 'true',
 *      defaultVoiceProvider: this._determineDefaultProvider(),
 *      fallbackEnabled: true
 *    };
 *
 * 5. Update HybridDemoDirector.ts to use new methods:
 *    // Instead of: bridge.send({ action: 'GENERATE_SPEECH', ... })
 *    // Use: await bridge.generateVoiceover(sceneId, text, provider)
 */

export { BridgeServiceVoiceRouting, VoiceRoutingConfig };
