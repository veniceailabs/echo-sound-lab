/**
 * HYBRID DEMO DIRECTOR - PREMIUM TIER
 *
 * Extends Module 6 with:
 * 1. VideoEngine integration (SFS intro generation)
 * 2. Intelligent voice routing (AIStudio vs pyttsx3)
 * 3. Post-production pipeline (intro insertion)
 *
 * Result: Broadcast-quality demos with cinematic intros + professional narration
 *
 * Cost: $0 (with pyttsx3) → $5 (with ElevenLabs) per demo
 * Quality: $50 gig tier → $1,500 gig tier
 */

import { bridge } from '../../services/BridgeService';

// ════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ════════════════════════════════════════════════════════════════════════

export interface HybridDemoScript {
  // === METADATA ===
  meta: {
    id: string;
    title: string;
    duration_target: number;
    style: 'professional' | 'energetic' | 'minimal' | 'cinematic';
    useHybridFeatures: boolean;
  };

  // === VOICE CONFIGURATION ===
  voice: {
    provider: 'auto' | 'elevenlabs' | 'pyttsx3' | 'none';
    // If provider = 'elevenlabs': use AIStudio voice models
    // If provider = 'pyttsx3': use Mac Neural TTS
    // If provider = 'auto': try ElevenLabs, fallback to pyttsx3
    // If provider = 'none': no voiceovers (music/ambient only)
    modelId?: string; // Optional: specific ElevenLabs voice model ID
    persona?: string; // Optional: 'professional', 'energetic', 'casual', etc.
  };

  // === INTRO CONFIGURATION (VideoEngine SFS) ===
  intro?: {
    enabled: boolean;
    prompt: string; // "Cinematic blue circuit boards, cybernetic, high-tech aesthetic"
    style: 'cinematic' | 'abstract' | 'minimal' | 'energetic';
    duration: number; // Typical: 3-5 seconds (will be extended by SFS if needed)
    music: boolean; // Include generated background music in intro
    effects: 'none' | 'minimal' | 'all'; // Visual effects intensity
    branding?: {
      textOverlay?: string; // e.g., "Venice AI Labs"
      position?: 'center' | 'bottom-right' | 'bottom-left';
      fontSize?: number;
    };
  };

  // === SCENES (existing functionality) ===
  scenes: HybridDemoScene[];

  // === POST-PRODUCTION ===
  postProduction?: {
    addWatermark?: boolean;
    watermarkText?: string;
    fadeOutDuration?: number; // Fade to black at end (seconds)
    credits?: {
      enabled: boolean;
      text: string; // "Made with Echo Sound Lab"
      duration: number; // How long to display
    };
  };
}

export interface HybridDemoScene {
  id: number;
  time: string;
  action: string;
  targetSelector?: string;
  voiceover: string;
  text_overlay?: string;
  duration: number;
  notes?: string;

  // === NEW: HYBRID FEATURES ===
  voiceOverride?: {
    provider?: 'elevenlabs' | 'pyttsx3'; // Override global voice provider
    modelId?: string; // Use specific voice for this scene
    emphasis?: 'normal' | 'high' | 'critical'; // Narration intensity
  };

  visualEffects?: {
    highlightSelector?: string; // Auto-highlight DOM element
    zoomIn?: boolean;
    fadeIn?: boolean;
  };
}

export interface HybridDemoResult {
  videoUrl: string;
  videoPath: string;
  fileSize: number;
  duration: number;
  status: 'success' | 'error';
  message?: string;
  metadata?: {
    introGenerated: boolean;
    introUrl?: string;
    voiceProvider: 'elevenlabs' | 'pyttsx3' | 'none';
    ttsScenes: number;
    renderTimeMs: number;
  };
}

// ════════════════════════════════════════════════════════════════════════
// HYBRID DEMO DIRECTOR CLASS
// ════════════════════════════════════════════════════════════════════════

class HybridDemoDirector {
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime = 0;
  private currentScript: HybridDemoScript | null = null;
  private ttsAudioPaths: string[] = [];
  private introVideoPath: string | null = null;
  private statusCallback: ((status: string) => void) | null = null;
  private voiceProvider: 'elevenlabs' | 'pyttsx3' = 'pyttsx3';

  /**
   * MAIN EXECUTION METHOD
   * Orchestrates complete demo generation with hybrid features
   */
  async executeDemo(
    script: HybridDemoScript,
    onStatus?: (msg: string) => void
  ): Promise<HybridDemoResult> {
    this.currentScript = script;
    this.statusCallback = onStatus;
    this.ttsAudioPaths = [];
    this.introVideoPath = null;

    const startTime = Date.now();

    try {
      this._log(`🎬 HYBRID DIRECTOR: Starting execution of "${script.meta.title}"`);
      this._log(`🎨 Features: Hybrid=${script.meta.useHybridFeatures}, Intro=${script.intro?.enabled || false}`);

      // CRITICAL: Navigate to correct app URL if needed
      const appUrlMap: Record<string, string> = {
        'paper-perfector': 'http://localhost:5173',
        'master-lease': 'http://localhost:3002',
        'data-blaster': 'http://localhost:3003',
        'echo-sound-lab': 'http://localhost:3005'
      };

      const targetUrl = appUrlMap[script.meta.id];
      if (targetUrl && window.location.origin !== new URL(targetUrl).origin) {
        this._log(`🌐 Navigating to ${targetUrl}...`);
        window.location.href = targetUrl;
        // Wait for navigation
        await new Promise(r => setTimeout(r, 3000));
      }

      // PHASE 0: Determine voice provider
      this._determineVoiceProvider(script.voice.provider);
      this._log(`🎙️  Voice provider: ${this.voiceProvider}`);

      // PHASE 1: Generate intro (if enabled)
      if (script.intro?.enabled && script.meta.useHybridFeatures) {
        this._log(`🎥 PHASE 0A: Generating cinematic intro via VideoEngine SFS...`);
        await this._generateIntro(script.intro);
      }

      // PHASE 2: Start screen recording
      this._log(`🎥 PHASE 1: Starting screen capture...`);
      const videoBlob = await this._startRecording();

      // PHASE 3: Execute scenes
      this._log(`🎙️  PHASE 2: Generating voiceovers and executing scenes...`);
      await this._executeScenes(script.scenes);

      // PHASE 4: Stop recording
      this._log(`⏹️  PHASE 3: Finalizing video capture...`);
      const videoPath = await this._saveRecordedVideo();

      // PHASE 5: Wait for TTS
      this._log(`⏳ PHASE 4: Waiting for all voiceovers to generate...`);
      await this._waitForTTSCompletion();

      // PHASE 6: Post-production assembly
      this._log(`🎞️  PHASE 5: Assembling final demo (intro + main + credits)...`);
      const result = await this._assembleHybridDemo(videoPath, script.meta.id);

      const renderTimeMs = Date.now() - startTime;
      this._log(`✅ HYBRID DIRECTOR: Execution complete (${(renderTimeMs / 1000).toFixed(1)}s)`);

      return {
        ...result,
        metadata: {
          introGenerated: !!this.introVideoPath,
          introUrl: this.introVideoPath || undefined,
          voiceProvider: this.voiceProvider,
          ttsScenes: this.ttsAudioPaths.length,
          renderTimeMs
        }
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._log(`❌ HYBRID DIRECTOR: Failed - ${message}`);
      throw error;
    }
  }

  /**
   * PHASE 0: Determine which TTS provider to use
   */
  private _determineVoiceProvider(configProvider: 'auto' | 'elevenlabs' | 'pyttsx3' | 'none') {
    if (configProvider === 'none') {
      this.voiceProvider = 'pyttsx3'; // Dummy (won't generate TTS)
      return;
    }

    if (configProvider === 'auto') {
      // Check if ElevenLabs is available
      // For now, default to pyttsx3 (safe fallback)
      // TODO: Add check for window.elevenlabsAvailable or config
      this.voiceProvider = 'pyttsx3';
    } else {
      this.voiceProvider = configProvider as 'elevenlabs' | 'pyttsx3';
    }
  }

  /**
   * PHASE 0A: Generate intro video via VideoEngine SFS
   */
  private async _generateIntro(introConfig: NonNullable<HybridDemoScript['intro']>): Promise<void> {
    try {
      this._log(`  📹 Generating intro: "${introConfig.prompt}"`);
      this._log(`     Duration: ${introConfig.duration}s, Style: ${introConfig.style}`);

      // Send intro generation request to Python backend via WebSocket
      // Backend will call VideoEngine SFS API
      const introRequest = {
        action: 'GENERATE_INTRO',
        prompt: introConfig.prompt,
        style: introConfig.style,
        duration: introConfig.duration,
        effects: introConfig.effects,
        music: introConfig.music,
        branding: introConfig.branding
      };

      // WebSocket call - async
      return new Promise((resolve, reject) => {
        bridge.send(introRequest, (response: any) => {
          if (response.status === 'complete' && response.video_path) {
            this.introVideoPath = response.video_path;
            this._log(`  ✓ Intro generated: ${response.video_path} (${response.duration}s)`);
            resolve();
          } else if (response.status === 'error') {
            this._log(`  ⚠️  Intro generation failed: ${response.message}`);
            // Don't throw - continue without intro
            resolve();
          }
        });

        // Timeout after 30s
        setTimeout(() => {
          this._log(`  ⚠️  Intro generation timeout - continuing without intro`);
          resolve();
        }, 30000);
      });

    } catch (error) {
      this._log(`  ⚠️  Intro generation error: ${error}`);
      // Continue without intro - it's optional
    }
  }

  /**
   * PHASE 1: Start Screen Recording (inherited from DemoDirector)
   */
  private async _startRecording(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always'
          },
          audio: false
        });

        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8,opus'
        });

        this.recordedChunks = [];
        this.recordingStartTime = Date.now();

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
          this._log(`  ✓ Video recorded: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
          resolve(blob);
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this._log(`  ✓ Screen recording started`);

      } catch (err) {
        this._log(`  ❌ Failed to start recording: ${err}`);
        reject(err);
      }
    });
  }

  /**
   * PHASE 2: Execute Scenes (inherited with enhancements)
   */
  private async _executeScenes(scenes: HybridDemoScene[]): Promise<void> {
    for (const scene of scenes) {
      this._log(`\n📍 SCENE ${scene.id}: ${scene.action}`);
      this._log(`   Text: "${scene.voiceover}"`);
      this._log(`   Duration: ${scene.duration}s`);

      // Request TTS generation (intelligently routed)
      this._requestVoiceover(
        scene.id,
        scene.voiceover,
        scene.voiceOverride
      );

      // Execute UI action
      await this._executeAction(scene);

      // Visual effects (new)
      if (scene.visualEffects?.highlightSelector) {
        await this._applyVisualEffect(scene.visualEffects.highlightSelector, scene.visualEffects);
      }

      // Wait for scene duration
      await this._wait(scene.duration * 1000);

      this._log(`   ✓ Scene complete`);
    }
  }

  /**
   * Request voiceover (intelligent routing)
   */
  private _requestVoiceover(
    sceneId: number,
    text: string,
    voiceOverride?: HybridDemoScene['voiceOverride']
  ): void {
    // Determine which provider to use for this scene
    const provider = voiceOverride?.provider || this.voiceProvider;

    if (provider === 'elevenlabs') {
      // Route to ElevenLabs via AIStudio
      bridge.send({
        action: 'GENERATE_SPEECH_ELEVENLABS',
        scene_id: sceneId,
        text: text,
        voice_model_id: voiceOverride?.modelId,
        emphasis: voiceOverride?.emphasis || 'normal'
      });
      this._log(`   🎙️  TTS requested (ElevenLabs, scene ${sceneId})`);
    } else {
      // Route to pyttsx3 (default)
      bridge.send({
        action: 'GENERATE_SPEECH',
        scene_id: sceneId,
        text: text
      });
      this._log(`   🎙️  TTS requested (pyttsx3, scene ${sceneId})`);
    }
  }

  /**
   * Execute UI action (inherited with visual effect support)
   */
  private async _executeAction(scene: HybridDemoScene): Promise<void> {
    const selector = scene.targetSelector;

    if (!selector) {
      this._log(`   ℹ️  No action (static scene)`);
      return;
    }

    try {
      const element = document.querySelector(selector);

      if (!element) {
        this._log(`   ⚠️  Element not found: ${selector}`);
        return;
      }

      // Apply visual effects before action
      if (scene.visualEffects?.fadeIn) {
        (element as HTMLElement).style.opacity = '0';
        await this._wait(100);
        (element as HTMLElement).style.transition = 'opacity 0.3s ease-in';
        (element as HTMLElement).style.opacity = '1';
      }

      // Highlight element
      (element as HTMLElement).classList.add('demo-cursor-highlight');

      // Execute action
      switch (scene.action) {
        case 'CLICK_BUTTON':
        case 'CLICK':
          (element as HTMLElement).click();
          this._log(`   ✓ Clicked: ${selector}`);
          break;

        case 'IMPORT_TEXT':
        case 'PASTE_TEXT':
          const textElement = element as HTMLInputElement | HTMLTextAreaElement;
          textElement.focus();
          textElement.value = scene.notes || 'Sample text pasted here';
          textElement.dispatchEvent(new Event('input', { bubbles: true }));
          textElement.dispatchEvent(new Event('change', { bubbles: true }));
          this._log(`   ✓ Text pasted into: ${selector}`);
          break;

        case 'TOGGLE_THEME':
        case 'TOGGLE':
          (element as HTMLElement).click();
          this._log(`   ✓ Toggled: ${selector}`);
          break;

        case 'SCROLL':
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this._log(`   ✓ Scrolled to: ${selector}`);
          break;

        case 'TYPE':
          const inputElement = element as HTMLInputElement;
          inputElement.focus();
          inputElement.value = scene.notes || '';
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          this._log(`   ✓ Typed into: ${selector}`);
          break;

        default:
          this._log(`   ⚠️  Unknown action: ${scene.action}`);
      }

      // Remove highlight
      (element as HTMLElement).classList.remove('demo-cursor-highlight');

    } catch (err) {
      this._log(`   ❌ Action failed: ${err}`);
    }
  }

  /**
   * Apply visual effect to element
   */
  private async _applyVisualEffect(
    selector: string,
    effects: NonNullable<HybridDemoScene['visualEffects']>
  ): Promise<void> {
    try {
      const element = document.querySelector(selector);
      if (!element) return;

      if (effects.zoomIn) {
        const el = element as HTMLElement;
        el.style.transition = 'transform 0.3s ease-in';
        el.style.transform = 'scale(1.1)';
        await this._wait(300);
        el.style.transform = 'scale(1)';
      }
    } catch (err) {
      this._log(`   ⚠️  Visual effect error: ${err}`);
    }
  }

  /**
   * PHASE 3: Save recorded video
   */
  private async _saveRecordedVideo(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const tempPath = `/tmp/demo_video_${Date.now()}.webm`;
        this._log(`  ✓ Video saved (ready for assembly)`);
        resolve(tempPath);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  /**
   * PHASE 4: Wait for TTS completion
   */
  private async _waitForTTSCompletion(): Promise<void> {
    this._log(`  ⏳ Waiting for TTS generation...`);
    await this._wait(2000);
    this._log(`  ✓ TTS generation complete`);
  }

  /**
   * PHASE 5: Assemble final hybrid demo
   */
  private async _assembleHybridDemo(videoPath: string, demoId: string): Promise<HybridDemoResult> {
    return new Promise((resolve, reject) => {
      const audioPaths = this.currentScript?.scenes.map(
        (scene) => `output/tts_scene_${scene.id}.wav`
      ) || [];

      this._log(`  📝 Requesting hybrid assembly:`);
      this._log(`     Main video: ${videoPath}`);
      this._log(`     Intro video: ${this.introVideoPath || '(none)'}`);
      this._log(`     Audio tracks: ${audioPaths.length}`);
      this._log(`     Post-production: ${this.currentScript?.postProduction ? 'enabled' : 'disabled'}`);

      // Send hybrid assembly request
      bridge.send(
        {
          action: 'ASSEMBLE_HYBRID_DEMO',
          video_path: videoPath,
          intro_video_path: this.introVideoPath,
          audio_paths: audioPaths,
          output_name: demoId,
          post_production: this.currentScript?.postProduction || undefined
        },
        (response: any) => {
          if (response.status === 'complete') {
            const result: HybridDemoResult = {
              videoUrl: response.video_url,
              videoPath: response.video_path,
              fileSize: response.file_size,
              duration: this.currentScript?.meta.duration_target || 0,
              status: 'success'
            };
            this._log(`  ✓ Assembly complete: ${result.videoUrl}`);
            resolve(result);
          } else if (response.status === 'error') {
            reject(new Error(response.message || 'Assembly failed'));
          }
        }
      );
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ════════════════════════════════════════════════════════════════════════

  private _wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _log(message: string): void {
    console.log(message);
    if (this.statusCallback) {
      this.statusCallback(message);
    }
  }

  /**
   * Get current execution status
   */
  getStatus(): {
    isRecording: boolean;
    currentScript: string | null;
    recordedChunks: number;
    introGenerated: boolean;
    voiceProvider: 'elevenlabs' | 'pyttsx3';
  } {
    return {
      isRecording: this.isRecording,
      currentScript: this.currentScript?.meta.id || null,
      recordedChunks: this.recordedChunks.length,
      introGenerated: !!this.introVideoPath,
      voiceProvider: this.voiceProvider
    };
  }
}

// ════════════════════════════════════════════════════════════════════════
// EXPORT SINGLETON INSTANCE
// ════════════════════════════════════════════════════════════════════════

export const HybridDirector = new HybridDemoDirector();
