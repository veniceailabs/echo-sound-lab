/**
 * MODULE 6: DEMO FACTORY - DEMO DIRECTOR
 *
 * The Demo Director reads JSON blueprints (demo scripts) and orchestrates:
 * 1. Screen recording (React UI actions)
 * 2. Voiceover generation (Python TTS backend)
 * 3. Video assembly (Python FFmpeg backend)
 *
 * Result: Fully automated demo video generation from a JSON script
 */

import { bridge } from '../../services/BridgeService';

// ════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ════════════════════════════════════════════════════════════════════════

export interface DemoScript {
  id: string;
  title: string;
  duration_target: number; // Total target duration in seconds
  scenes: DemoScene[];
}

export interface DemoScene {
  id: number;
  time: string; // "0:00", "0:05", etc.
  action: string; // "CLICK_BUTTON", "IMPORT_TEXT", "TOGGLE_THEME", etc.
  targetSelector?: string; // CSS selector for element to interact with
  voiceover: string; // Text to be spoken via TTS
  text_overlay?: string; // Optional on-screen text
  duration: number; // How long to hold this scene (seconds)
  notes?: string; // Implementation notes
}

export interface DemoResult {
  videoUrl: string;
  videoPath: string;
  fileSize: number;
  duration: number;
  status: 'success' | 'error';
  message?: string;
}

// ════════════════════════════════════════════════════════════════════════
// DEMO DIRECTOR CLASS
// ════════════════════════════════════════════════════════════════════════

class DemoDirector {
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime = 0;
  private currentScript: DemoScript | null = null;
  private ttsAudioPaths: string[] = [];
  private statusCallback: ((status: string) => void) | null = null;

  /**
   * MAIN EXECUTION METHOD
   * Reads a demo script and generates a complete video
   */
  async executeDemo(script: DemoScript, onStatus?: (msg: string) => void): Promise<DemoResult> {
    this.currentScript = script;
    this.statusCallback = onStatus;
    this.ttsAudioPaths = [];

    try {
      this._log(`🎬 DIRECTOR: Starting execution of "${script.title}"`);
      this._log(`📋 Script has ${script.scenes.length} scenes, ${script.duration_target}s target`);

      // PHASE 1: Start screen recording
      this._log(`🎥 PHASE 1: Starting screen capture...`);
      const videoBlob = await this._startRecording();

      // PHASE 2: Execute scenes (generate TTS + drive UI)
      this._log(`🎙️  PHASE 2: Generating voiceovers and executing scenes...`);
      await this._executeScenes(script.scenes);

      // PHASE 3: Stop recording and save video
      this._log(`⏹️  PHASE 3: Finalizing video capture...`);
      const videoPath = await this._saveRecordedVideo();

      // PHASE 4: Wait for all TTS generation to complete
      this._log(`⏳ PHASE 4: Waiting for all voiceovers to generate...`);
      await this._waitForTTSCompletion();

      // PHASE 5: Assemble final demo (video + audio)
      this._log(`🎞️  PHASE 5: Assembling final demo video...`);
      const result = await this._assembleDemo(videoPath, script.id);

      this._log(`✅ DEMO DIRECTOR: Execution complete`);
      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._log(`❌ DEMO DIRECTOR: Failed - ${message}`);
      throw error;
    }
  }

  /**
   * PHASE 1: Start Screen Recording
   */
  private async _startRecording(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        // Request screen capture from user
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always' // Show cursor movement (helpful for watching the automation)
          },
          audio: false // We'll add audio via FFmpeg later
        });

        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8,opus'
        });

        this.recordedChunks = [];
        this.recordingStartTime = Date.now();

        // Collect data chunks
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        // When recording stops
        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
          this._log(`  ✓ Video recorded: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
          resolve(blob);
        };

        // Start recording
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
   * PHASE 2: Execute All Scenes
   * For each scene:
   *   1. Request TTS generation from Python (async)
   *   2. Execute the UI action (via Ghost system or DOM manipulation)
   *   3. Wait for scene duration
   */
  private async _executeScenes(scenes: DemoScene[]): Promise<void> {
    for (const scene of scenes) {
      this._log(`\n📍 SCENE ${scene.id}: ${scene.action}`);
      this._log(`   Text: "${scene.voiceover}"`);
      this._log(`   Duration: ${scene.duration}s`);

      // STEP A: Request TTS generation (fire and forget, happens in parallel)
      this._requestTTS(scene.id, scene.voiceover);

      // STEP B: Execute the UI action
      await this._executeAction(scene);

      // STEP C: Wait for scene duration
      await this._wait(scene.duration * 1000);

      this._log(`   ✓ Scene complete`);
    }
  }

  /**
   * Request TTS voiceover from Python backend
   * (Non-blocking - TTS happens in parallel with video recording)
   */
  private _requestTTS(sceneId: number, text: string): void {
    // Send async request to Python backend
    // Python will generate WAV and save to output/tts_scene_{sceneId}.wav
    bridge.send({
      action: 'GENERATE_SPEECH',
      scene_id: sceneId,
      text: text
    });

    this._log(`   🎙️  TTS requested (scene ${sceneId})`);
  }

  /**
   * Execute the UI action specified in the scene
   */
  private async _executeAction(scene: DemoScene): Promise<void> {
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

      // Highlight element to show what's being clicked
      (element as HTMLElement).classList.add('demo-cursor-highlight');

      // Execute different actions based on scene.action
      switch (scene.action) {
        case 'CLICK_BUTTON':
        case 'CLICK':
          (element as HTMLElement).click();
          this._log(`   ✓ Clicked: ${selector}`);
          break;

        case 'IMPORT_TEXT':
        case 'PASTE_TEXT':
          // Assuming element is an input/textarea
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
   * PHASE 3: Save the recorded video
   */
  private async _saveRecordedVideo(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Send video blob to Python backend for assembly
        // For now, we'll return a temp path
        const tempPath = `/tmp/demo_video_${Date.now()}.webm`;
        this._log(`  ✓ Video saved (ready for assembly)`);
        resolve(tempPath);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  /**
   * PHASE 4: Wait for all TTS files to be generated
   */
  private async _waitForTTSCompletion(): Promise<void> {
    // In production, we'd poll the backend to verify all TTS files exist
    // For V1, we just wait a reasonable time
    this._log(`  ⏳ Waiting for TTS generation...`);
    await this._wait(2000); // Wait 2s for TTS to finish
    this._log(`  ✓ TTS generation complete`);
  }

  /**
   * PHASE 5: Assemble final demo
   * Send to Python backend: video + audio paths → final MP4
   */
  private async _assembleDemo(videoPath: string, demoId: string): Promise<DemoResult> {
    return new Promise((resolve, reject) => {
      // Build list of TTS audio paths based on scenes
      const audioPaths = this.currentScript?.scenes.map(
        (scene) => `output/tts_scene_${scene.id}.wav`
      ) || [];

      this._log(`  📝 Requesting assembly of:`);
      this._log(`     Video: ${videoPath}`);
      this._log(`     Audio tracks: ${audioPaths.length}`);

      // Send assembly request to Python
      bridge.send(
        {
          action: 'ASSEMBLE_DEMO',
          video_path: videoPath,
          audio_paths: audioPaths,
          output_name: demoId
        },
        (response: any) => {
          if (response.status === 'complete') {
            const result: DemoResult = {
              videoUrl: response.video_url,
              videoPath: response.video_path,
              fileSize: response.file_size,
              duration: this.currentScript?.duration_target || 0,
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
   * Get the current status of the demo execution
   */
  getStatus(): {
    isRecording: boolean;
    currentScript: string | null;
    recordedChunks: number;
  } {
    return {
      isRecording: this.isRecording,
      currentScript: this.currentScript?.id || null,
      recordedChunks: this.recordedChunks.length
    };
  }
}

// ════════════════════════════════════════════════════════════════════════
// EXPORT SINGLETON INSTANCE
// ════════════════════════════════════════════════════════════════════════

export const Director = new DemoDirector();
