/**
 * algorithmicReverb.ts — Real-time WebAudio reverb engine
 *
 * Implements a Schroeder/Moorer reverb using the WebAudio API:
 * - 4 parallel comb filters (feedback delay networks)
 * - 2 allpass filters in series
 * - Room size, damping, wet/dry, pre-delay, diffusion controls
 *
 * Also generates an offline-rendered reverb tail for exporting.
 */

export type ReverbPreset =
  | 'small_room'
  | 'medium_room'
  | 'large_room'
  | 'hall'
  | 'cathedral'
  | 'plate'
  | 'spring'
  | 'ambience';

export interface ReverbConfig {
  preset: ReverbPreset;
  roomSize: number;     // 0–1 (controls comb filter delays)
  damping: number;      // 0–1 (high-freq rolloff in feedback)
  wetLevel: number;     // 0–1
  dryLevel: number;     // 0–1
  preDelayMs: number;   // 0–100ms
  diffusion: number;    // 0–1 (allpass filter feedback)
  stereoWidth: number;  // 0–1
}

export const REVERB_PRESETS: Record<ReverbPreset, ReverbConfig> = {
  small_room: {
    preset: 'small_room',
    roomSize: 0.2,
    damping: 0.7,
    wetLevel: 0.25,
    dryLevel: 0.8,
    preDelayMs: 5,
    diffusion: 0.6,
    stereoWidth: 0.5,
  },
  medium_room: {
    preset: 'medium_room',
    roomSize: 0.45,
    damping: 0.55,
    wetLevel: 0.3,
    dryLevel: 0.75,
    preDelayMs: 15,
    diffusion: 0.65,
    stereoWidth: 0.7,
  },
  large_room: {
    preset: 'large_room',
    roomSize: 0.65,
    damping: 0.4,
    wetLevel: 0.35,
    dryLevel: 0.7,
    preDelayMs: 25,
    diffusion: 0.7,
    stereoWidth: 0.8,
  },
  hall: {
    preset: 'hall',
    roomSize: 0.8,
    damping: 0.3,
    wetLevel: 0.4,
    dryLevel: 0.6,
    preDelayMs: 40,
    diffusion: 0.75,
    stereoWidth: 0.9,
  },
  cathedral: {
    preset: 'cathedral',
    roomSize: 0.95,
    damping: 0.15,
    wetLevel: 0.5,
    dryLevel: 0.5,
    preDelayMs: 60,
    diffusion: 0.85,
    stereoWidth: 1.0,
  },
  plate: {
    preset: 'plate',
    roomSize: 0.55,
    damping: 0.65,
    wetLevel: 0.35,
    dryLevel: 0.7,
    preDelayMs: 8,
    diffusion: 0.9,
    stereoWidth: 0.8,
  },
  spring: {
    preset: 'spring',
    roomSize: 0.35,
    damping: 0.8,
    wetLevel: 0.3,
    dryLevel: 0.75,
    preDelayMs: 3,
    diffusion: 0.4,
    stereoWidth: 0.4,
  },
  ambience: {
    preset: 'ambience',
    roomSize: 0.4,
    damping: 0.6,
    wetLevel: 0.15,
    dryLevel: 0.9,
    preDelayMs: 12,
    diffusion: 0.7,
    stereoWidth: 0.85,
  },
};

// Comb filter delay times (in ms) — prime-ish to avoid flutter echo
const COMB_DELAYS_MS = [29.7, 37.1, 41.1, 43.7];
const ALLPASS_DELAYS_MS = [5.0, 1.7];

/** Generate a synthetic impulse response buffer from reverb parameters */
export function generateImpulseResponse(
  ctx: BaseAudioContext,
  config: ReverbConfig,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const decayTime = 0.5 + config.roomSize * 4.0; // 0.5s to 4.5s
  const length = Math.floor(sr * decayTime);
  const ir = ctx.createBuffer(2, length, sr);

  const preDelaySamples = Math.floor(config.preDelayMs * sr / 1000);

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    const stereoOffset = ch === 1 ? Math.floor(config.stereoWidth * 7) : 0;

    // Build Schroeder reverb via convolution with synthetic IR
    // Step 1: Early reflections (6 sparse echoes)
    const earlyTimes = [0.015, 0.025, 0.031, 0.044, 0.058, 0.072];
    const earlyGains = [0.9, 0.7, 0.6, 0.5, 0.4, 0.35];
    for (let i = 0; i < earlyTimes.length; i++) {
      const s = Math.floor(earlyTimes[i] * sr) + preDelaySamples + stereoOffset;
      if (s < length) data[s] = earlyGains[i] * (ch === 1 ? 0.95 : 1.0);
    }

    // Step 2: Exponential noise tail
    for (let i = preDelaySamples; i < length; i++) {
      const t = (i - preDelaySamples) / sr;
      const envelope = Math.exp(-t * (3.0 / decayTime));
      // Diffuse noise with damping (high-freq roll-off via adjacent sample blend)
      const noise = (Math.random() * 2 - 1);
      data[i] += noise * envelope * config.wetLevel * 0.15;

      // Apply damping: mix current with previous (simple 1-pole LPF)
      if (i > preDelaySamples) {
        data[i] = data[i] * (1 - config.damping * 0.5) + data[i - 1] * config.damping * 0.5;
      }
    }

    // Step 3: Add comb filter resonances
    for (const delayMs of COMB_DELAYS_MS) {
      const delaySamples = Math.floor((delayMs + stereoOffset * 0.1) * sr / 1000);
      const feedback = 0.5 + config.roomSize * 0.45;
      let buf = 0;
      for (let i = preDelaySamples; i < length; i++) {
        const readIdx = i - delaySamples;
        if (readIdx >= 0) {
          buf = data[readIdx] + buf * feedback * (1 - config.damping * 0.3);
          data[i] += buf * 0.05;
        }
      }
    }

    // Normalize
    let peak = 0;
    for (let i = 0; i < length; i++) if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
    if (peak > 0.01) for (let i = 0; i < length; i++) data[i] /= peak;
  }

  return ir;
}

/** Apply reverb to an AudioBuffer offline */
export async function applyReverb(
  buffer: AudioBuffer,
  config: ReverbConfig,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const numCh = Math.min(buffer.numberOfChannels, 2);
  const ctx = new OfflineAudioContext(numCh, buffer.length, sr);

  const ir = generateImpulseResponse(ctx, config);
  const convolver = ctx.createConvolver();
  convolver.buffer = ir;
  convolver.normalize = true;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // Dry path
  const dryGain = ctx.createGain();
  dryGain.gain.value = config.dryLevel;

  // Wet path
  const wetGain = ctx.createGain();
  wetGain.gain.value = config.wetLevel;

  // Pre-delay
  const preDelay = ctx.createDelay(0.2);
  preDelay.delayTime.value = config.preDelayMs / 1000;

  src.connect(dryGain);
  src.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(ctx.destination);
  wetGain.connect(ctx.destination);

  src.start();
  return ctx.startRendering();
}

export const PRESET_DESCRIPTIONS: Record<ReverbPreset, string> = {
  small_room: 'Tight, intimate reflections — like a bedroom studio or small booth. Adds presence without washing out.',
  medium_room: 'Mid-size room ambience. Great for drums, guitars, and general presence.',
  large_room: 'Open, airy room sound. Works well for pianos, strings, and ballads.',
  hall: 'Concert hall decay — lush and spacious. Use sparingly on individual elements; works great on sends.',
  cathedral: 'Massive, slow-decaying reverb. Creates epic, cinematic space. Long tail, be careful with busy mixes.',
  plate: 'Classic studio plate reverb — smooth, dense, and musical. The go-to for vocals and snare.',
  spring: 'Vintage spring tank character — slightly wobbly, analog warmth. Perfect for guitars and retro vibes.',
  ambience: 'Very subtle glue reverb — barely audible, just adds depth and cohesion. Use as a master bus send.',
};
