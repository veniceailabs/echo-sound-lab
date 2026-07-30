/**
 * Drum Machine Service — 16-step sequencer with drum kits
 *
 * Features:
 * - Multiple drum kits (acoustic, trap, minimal, 808)
 * - Each kit has 6 drum sounds (kick, snare, clap, hihat, tom, perc)
 * - 16-step pattern editor
 * - BPM/key sync to vocal
 * - Pattern library with presets
 * - Audio synthesis + playback
 */

export type DrumKit = 'acoustic' | 'trap' | 'minimal' | '808';
export type DrumSound = 'kick' | 'snare' | 'clap' | 'hihat' | 'tom' | 'perc';

export interface DrumPattern {
  id: string;
  name: string;
  kit: DrumKit;
  bpm: number;
  steps: PatternStep[];
  createdAt: Date;
  lastModified: Date;
}

export interface PatternStep {
  stepIndex: number; // 0-15
  sounds: {
    [key in DrumSound]?: boolean; // true if sound plays on this step
  };
}

export interface DrumKitConfig {
  id: DrumKit;
  name: string;
  sounds: {
    [key in DrumSound]: DrumSoundConfig;
  };
}

interface DrumSoundConfig {
  name: string;
  frequency: number; // Hz (for synthesis)
  duration: number; // ms
  decay: number; // 0-1, how quickly the sound dies
  waveform: 'sine' | 'triangle' | 'square' | 'sawtooth';
}

const DEFAULT_SAMPLE_RATE = 44100;
const TWO_PI = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function waveformValue(type: DrumSoundConfig['waveform'], phase: number): number {
  const wrapped = phase % TWO_PI;
  if (type === 'triangle') {
    return 2 * Math.asin(Math.sin(wrapped)) / Math.PI;
  }
  if (type === 'square') {
    return Math.sign(Math.sin(wrapped)) || 1;
  }
  if (type === 'sawtooth') {
    return 2 * (wrapped / TWO_PI) - 1;
  }
  return Math.sin(wrapped);
}

function encodeWavBlob(left: Float32Array, right: Float32Array, sampleRate = DEFAULT_SAMPLE_RATE): Blob {
  const frameCount = Math.min(left.length, right.length);
  const channels = 2;
  const bytesPerSample = 2;
  const dataSize = frameCount * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i += 1) {
    view.setInt16(offset, Math.round(clamp(left[i] ?? 0, -1, 1) * 0x7fff), true);
    offset += 2;
    view.setInt16(offset, Math.round(clamp(right[i] ?? 0, -1, 1) * 0x7fff), true);
    offset += 2;
  }

  return new Blob([out], { type: 'audio/wav' });
}

class DrumMachineEngine {
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private currentStep = 0;
  private bpm = 95;
  private pattern: DrumPattern | null = null;
  private oscillators: Map<string, OscillatorNode> = new Map();

  private drumKits: Map<DrumKit, DrumKitConfig> = new Map([
    [
      'acoustic',
      {
        id: 'acoustic',
        name: 'Acoustic',
        sounds: {
          kick: { name: 'Kick', frequency: 100, duration: 200, decay: 0.8, waveform: 'sine' },
          snare: { name: 'Snare', frequency: 200, duration: 150, decay: 0.6, waveform: 'triangle' },
          clap: { name: 'Clap', frequency: 300, duration: 120, decay: 0.5, waveform: 'square' },
          hihat: { name: 'Hi-Hat', frequency: 12000, duration: 80, decay: 0.3, waveform: 'sawtooth' },
          tom: { name: 'Tom', frequency: 400, duration: 130, decay: 0.7, waveform: 'sine' },
          perc: { name: 'Perc', frequency: 1000, duration: 100, decay: 0.4, waveform: 'triangle' },
        },
      },
    ],
    [
      'trap',
      {
        id: 'trap',
        name: 'Trap',
        sounds: {
          kick: { name: '808 Kick', frequency: 80, duration: 250, decay: 0.9, waveform: 'sine' },
          snare: { name: 'Snare', frequency: 250, duration: 140, decay: 0.65, waveform: 'triangle' },
          clap: { name: 'Clap', frequency: 350, duration: 110, decay: 0.55, waveform: 'square' },
          hihat: { name: 'Closed Hat', frequency: 14000, duration: 70, decay: 0.25, waveform: 'sawtooth' },
          tom: { name: 'Tom', frequency: 500, duration: 120, decay: 0.75, waveform: 'sine' },
          perc: { name: 'Cym', frequency: 11000, duration: 90, decay: 0.35, waveform: 'triangle' },
        },
      },
    ],
    [
      'minimal',
      {
        id: 'minimal',
        name: 'Minimal',
        sounds: {
          kick: { name: 'Kick', frequency: 110, duration: 180, decay: 0.7, waveform: 'sine' },
          snare: { name: 'Snare', frequency: 220, duration: 130, decay: 0.55, waveform: 'triangle' },
          clap: { name: 'Clap', frequency: 280, duration: 100, decay: 0.5, waveform: 'square' },
          hihat: { name: 'Hat', frequency: 10000, duration: 60, decay: 0.2, waveform: 'sawtooth' },
          tom: { name: 'Tom', frequency: 350, duration: 110, decay: 0.6, waveform: 'sine' },
          perc: { name: 'Perc', frequency: 800, duration: 80, decay: 0.3, waveform: 'triangle' },
        },
      },
    ],
    [
      '808',
      {
        id: '808',
        name: '808',
        sounds: {
          kick: { name: '808', frequency: 60, duration: 300, decay: 0.95, waveform: 'sine' },
          snare: { name: 'Snare', frequency: 240, duration: 150, decay: 0.7, waveform: 'triangle' },
          clap: { name: 'Clap', frequency: 320, duration: 120, decay: 0.6, waveform: 'square' },
          hihat: { name: 'Hat', frequency: 13000, duration: 75, decay: 0.28, waveform: 'sawtooth' },
          tom: { name: 'Tom', frequency: 480, duration: 140, decay: 0.8, waveform: 'sine' },
          perc: { name: 'Cowbell', frequency: 1200, duration: 110, decay: 0.45, waveform: 'triangle' },
        },
      },
    ],
  ]);

  constructor() {
    // Initialize on first user interaction
    if (typeof window !== 'undefined') {
      document.addEventListener('click', () => this.initAudioContext(), { once: true });
    }
  }

  private initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playSound(sound: DrumSound, kit: DrumKit, volume: number = 0.8): void {
    if (!this.audioContext) this.initAudioContext();
    if (!this.audioContext) return;

    const kitConfig = this.drumKits.get(kit);
    if (!kitConfig || !kitConfig.sounds[sound]) return;

    const soundConfig = kitConfig.sounds[sound];
    const now = this.audioContext.currentTime;

    // Create oscillator
    const osc = this.audioContext.createOscillator();
    osc.type = soundConfig.waveform;
    osc.frequency.setValueAtTime(soundConfig.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(0.1, now + soundConfig.duration / 1000);

    // Create gain envelope
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + (soundConfig.duration * soundConfig.decay) / 1000);

    // Connect and play
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + (soundConfig.duration * soundConfig.decay) / 1000);
  }

  playStep(pattern: DrumPattern, stepIndex: number): void {
    const step = pattern.steps.find((s) => s.stepIndex === stepIndex);
    if (!step) return;

    // Play all active sounds in this step
    Object.entries(step.sounds).forEach(([sound, isActive]) => {
      if (isActive) {
        this.playSound(sound as DrumSound, pattern.kit, 0.8);
      }
    });
  }

  async play(pattern: DrumPattern): Promise<void> {
    if (!this.audioContext) this.initAudioContext();

    this.pattern = pattern;
    this.bpm = pattern.bpm;
    this.isPlaying = true;
    this.currentStep = 0;

    const stepDuration = (60000 / this.bpm) * 0.25; // 16th note duration in ms

    while (this.isPlaying) {
      if (this.pattern) {
        this.playStep(this.pattern, this.currentStep);
      }

      await new Promise((resolve) => setTimeout(resolve, stepDuration));
      this.currentStep = (this.currentStep + 1) % 16;
    }
  }

  stop(): void {
    this.isPlaying = false;
  }

  getKits(): DrumKitConfig[] {
    return Array.from(this.drumKits.values());
  }

  getKit(id: DrumKit): DrumKitConfig | undefined {
    return this.drumKits.get(id);
  }

  createPattern(name: string, kit: DrumKit = 'acoustic', bpm: number = 95): DrumPattern {
    const steps: PatternStep[] = Array.from({ length: 16 }, (_, i) => ({
      stepIndex: i,
      sounds: {},
    }));

    return {
      id: Math.random().toString(36).slice(2),
      name,
      kit,
      bpm,
      steps,
      createdAt: new Date(),
      lastModified: new Date(),
    };
  }

  updateStep(pattern: DrumPattern, stepIndex: number, sounds: Record<DrumSound, boolean>): DrumPattern {
    return {
      ...pattern,
      steps: pattern.steps.map((step) =>
        step.stepIndex === stepIndex ? { ...step, sounds } : step
      ),
      lastModified: new Date(),
    };
  }

  exportAsWav(pattern: DrumPattern, lengthBars: number = 4): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const kitConfig = this.drumKits.get(pattern.kit);
        if (!kitConfig) {
          throw new Error(`Unknown drum kit: ${pattern.kit}`);
        }

        const stepDurationSec = 60 / pattern.bpm / 4;
        const totalSteps = Math.max(1, Math.ceil(lengthBars * 16));
        const totalFrames = Math.max(1, Math.ceil(stepDurationSec * totalSteps * DEFAULT_SAMPLE_RATE));
        const left = new Float32Array(totalFrames);
        const right = new Float32Array(totalFrames);

        const activeSounds = (Object.keys(kitConfig.sounds) as DrumSound[]).filter((sound) => (
          pattern.steps.some((step) => step.stepIndex < totalSteps && step.sounds[sound])
        ));

        for (const step of pattern.steps) {
          if (step.stepIndex >= totalSteps) continue;
          const stepStart = Math.floor(step.stepIndex * stepDurationSec * DEFAULT_SAMPLE_RATE);
          for (const [sound, isActive] of Object.entries(step.sounds)) {
            if (!isActive) continue;
            const config = kitConfig.sounds[sound as DrumSound];
            if (!config) continue;

            const soundFrames = Math.max(1, Math.min(
              Math.floor((config.duration / 1000) * DEFAULT_SAMPLE_RATE),
              Math.floor(stepDurationSec * DEFAULT_SAMPLE_RATE)
            ));
            const decayFrames = Math.max(1, Math.floor(soundFrames * config.decay));
            const mixGain = 0.42 / Math.max(1, activeSounds.length);

            for (let i = 0; i < soundFrames && stepStart + i < totalFrames; i += 1) {
              const env = Math.exp(-(i / decayFrames) * 4.5);
              const sample = waveformValue(config.waveform, TWO_PI * config.frequency * (i / DEFAULT_SAMPLE_RATE));
              const value = sample * env * mixGain;
              left[stepStart + i] += value;
              right[stepStart + i] += value;
            }
          }
        }

        let peak = 0;
        for (let i = 0; i < totalFrames; i += 1) {
          peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        }
        if (peak > 0.98) {
          const scale = 0.98 / peak;
          for (let i = 0; i < totalFrames; i += 1) {
            left[i] *= scale;
            right[i] *= scale;
          }
        }

        resolve(encodeWavBlob(left, right, DEFAULT_SAMPLE_RATE));
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Singleton instance
let engine: DrumMachineEngine | null = null;

function getEngine(): DrumMachineEngine {
  if (!engine) {
    engine = new DrumMachineEngine();
  }
  return engine;
}

export const drumMachineService = {
  /**
   * Get all available drum kits
   */
  getKits(): DrumKitConfig[] {
    return getEngine().getKits();
  },

  /**
   * Get specific drum kit
   */
  getKit(id: DrumKit): DrumKitConfig | undefined {
    return getEngine().getKit(id);
  },

  /**
   * Create a new drum pattern
   */
  createPattern(name: string, kit: DrumKit = 'acoustic', bpm: number = 95): DrumPattern {
    return getEngine().createPattern(name, kit, bpm);
  },

  /**
   * Play a sound from a kit (for testing)
   */
  playSound(sound: DrumSound, kit: DrumKit, volume: number = 0.8): void {
    getEngine().playSound(sound, kit, volume);
  },

  /**
   * Play a single step
   */
  playStep(pattern: DrumPattern, stepIndex: number): void {
    getEngine().playStep(pattern, stepIndex);
  },

  /**
   * Update a pattern step
   */
  updateStep(pattern: DrumPattern, stepIndex: number, sounds: Record<DrumSound, boolean>): DrumPattern {
    return getEngine().updateStep(pattern, stepIndex, sounds);
  },

  /**
   * Play entire pattern (loops)
   */
  async playPattern(pattern: DrumPattern): Promise<void> {
    return getEngine().play(pattern);
  },

  /**
   * Stop playback
   */
  stopPattern(): void {
    getEngine().stop();
  },

  /**
   * Export pattern as WAV file
   */
  async exportPattern(pattern: DrumPattern, lengthBars: number = 4): Promise<Blob> {
    return getEngine().exportAsWav(pattern, lengthBars);
  },

  /**
   * Get preset patterns
   */
  getPresets(): DrumPattern[] {
    return [
      {
        id: 'preset-trap-4on4',
        name: 'Trap 4-On-4',
        kit: 'trap',
        bpm: 140,
        steps: [
          { stepIndex: 0, sounds: { kick: true } },
          { stepIndex: 2, sounds: { hihat: true } },
          { stepIndex: 3, sounds: { hihat: true } },
          { stepIndex: 4, sounds: { snare: true } },
          { stepIndex: 6, sounds: { hihat: true } },
          { stepIndex: 7, sounds: { hihat: true } },
          { stepIndex: 8, sounds: { kick: true } },
          { stepIndex: 10, sounds: { hihat: true } },
          { stepIndex: 11, sounds: { hihat: true } },
          { stepIndex: 12, sounds: { snare: true } },
          { stepIndex: 13, sounds: { hihat: true } },
          { stepIndex: 14, sounds: { hihat: true } },
          { stepIndex: 15, sounds: { hihat: true } },
        ],
        createdAt: new Date(),
        lastModified: new Date(),
      },
      {
        id: 'preset-808-minimal',
        name: '808 Minimal',
        kit: '808',
        bpm: 95,
        steps: [
          { stepIndex: 0, sounds: { kick: true } },
          { stepIndex: 4, sounds: { snare: true } },
          { stepIndex: 8, sounds: { kick: true } },
          { stepIndex: 12, sounds: { snare: true } },
        ],
        createdAt: new Date(),
        lastModified: new Date(),
      },
    ];
  },
};
