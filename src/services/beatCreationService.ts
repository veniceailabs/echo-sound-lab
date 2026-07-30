/**
 * Beat Creation Service — Loop library, drum machine, tempo/key sync
 *
 * Enables users to create backing tracks for their vocals within Echo Sound Lab.
 * MVP features:
 *   - Loop library (Splice/Loopmasters samples)
 *   - Drum machine (16-step sequencer)
 *   - Tempo/key sync to vocal or manual BPM
 *   - Basic mixer (layer loops)
 *   - Export stems for mastering
 */

export interface LoopSample {
  id: string;
  name: string;
  category: 'drums' | 'bass' | 'melody' | 'pad' | 'synth' | 'guitar' | 'piano';
  genre: 'hip-hop' | 'trap' | 'rnb' | 'pop' | 'electronic' | 'rock';
  bpm: number;
  duration: number; // seconds
  audioUrl: string;
  waveform?: number[];
  tags: string[];
}

export interface DrumSequence {
  trackId: string;
  pattern: Array<{ step: number; velocity: number }>;
  instrument: 'kick' | 'snare' | 'clap' | 'hihat' | 'tom' | 'perc';
  muted: boolean;
}

export interface BeatProject {
  id: string;
  name: string;
  bpm: number;
  key: string;
  bars: number; // number of bars in pattern
  loops: Array<{
    id: string;
    loopId: string;
    trackNumber: number;
    volume: number;
    pan: number;
    muted: boolean;
    soloedAt?: number;
  }>;
  drums: DrumSequence[];
  createdAt: Date;
  lastModified: Date;
}

// Sample loop library (MVP — would be replaced with Splice API)
export const SAMPLE_LOOPS: LoopSample[] = [
  // Hip-hop loops
  {
    id: 'hh-bass-1',
    name: '808 Bass Line — Hip-Hop',
    category: 'bass',
    genre: 'hip-hop',
    bpm: 95,
    duration: 8,
    audioUrl: '/samples/hh-bass-1.wav',
    tags: ['808', 'deep', 'trunk'],
  },
  {
    id: 'hh-melody-1',
    name: 'Synth Melody — Boom Bap',
    category: 'synth',
    genre: 'hip-hop',
    bpm: 95,
    duration: 8,
    audioUrl: '/samples/hh-melody-1.wav',
    tags: ['synth', 'vintage', 'soulful'],
  },
  {
    id: 'hh-pad-1',
    name: 'Atmospheric Pad',
    category: 'pad',
    genre: 'hip-hop',
    bpm: 95,
    duration: 16,
    audioUrl: '/samples/hh-pad-1.wav',
    tags: ['ambient', 'ethereal'],
  },
  // Trap loops
  {
    id: 'trap-bass-1',
    name: 'Trap 808 Roll',
    category: 'bass',
    genre: 'trap',
    bpm: 140,
    duration: 8,
    audioUrl: '/samples/trap-bass-1.wav',
    tags: ['808', 'modulated', 'bright'],
  },
  {
    id: 'trap-synth-1',
    name: 'Trap Lead Synth',
    category: 'synth',
    genre: 'trap',
    bpm: 140,
    duration: 4,
    audioUrl: '/samples/trap-synth-1.wav',
    tags: ['lead', 'bright', 'piercing'],
  },
  // R&B loops
  {
    id: 'rnb-bass-1',
    name: 'R&B Smooth Bass',
    category: 'bass',
    genre: 'rnb',
    bpm: 90,
    duration: 8,
    audioUrl: '/samples/rnb-bass-1.wav',
    tags: ['smooth', 'warm', 'soulful'],
  },
  {
    id: 'rnb-piano-1',
    name: 'R&B Piano Riff',
    category: 'piano',
    genre: 'rnb',
    bpm: 90,
    duration: 8,
    audioUrl: '/samples/rnb-piano-1.wav',
    tags: ['piano', 'jazzy', 'chords'],
  },
  // Pop loops
  {
    id: 'pop-synth-1',
    name: 'Pop Synth Hook',
    category: 'synth',
    genre: 'pop',
    bpm: 120,
    duration: 4,
    audioUrl: '/samples/pop-synth-1.wav',
    tags: ['catchy', 'bright', 'modern'],
  },
  {
    id: 'pop-guitar-1',
    name: 'Pop Guitar Riff',
    category: 'guitar',
    genre: 'pop',
    bpm: 120,
    duration: 8,
    audioUrl: '/samples/pop-guitar-1.wav',
    tags: ['acoustic', 'upbeat'],
  },
];

// Drum sound library (GM drums, would be replaced with commercial samples)
export const DRUM_KITS = {
  acoustic: {
    kick: { name: '808 Kick', url: '/drums/acoustic-kick.wav' },
    snare: { name: 'Snare Crack', url: '/drums/acoustic-snare.wav' },
    clap: { name: 'Clap', url: '/drums/acoustic-clap.wav' },
    hihat: { name: 'Hi-Hat Closed', url: '/drums/acoustic-hihat.wav' },
    tom: { name: 'Tom High', url: '/drums/acoustic-tom.wav' },
    perc: { name: 'Perc Clave', url: '/drums/acoustic-perc.wav' },
  },
  trap: {
    kick: { name: 'Trap Kick', url: '/drums/trap-kick.wav' },
    snare: { name: 'Trap Snare', url: '/drums/trap-snare.wav' },
    clap: { name: 'Trap Clap', url: '/drums/trap-clap.wav' },
    hihat: { name: 'Trap Hi-Hat', url: '/drums/trap-hihat.wav' },
    tom: { name: 'Trap Tom', url: '/drums/trap-tom.wav' },
    perc: { name: 'Trap Perc', url: '/drums/trap-perc.wav' },
  },
};

const DEFAULT_RENDER_SAMPLE_RATE = 44100;
const TWO_PI = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createStereoBuffer(frameCount: number): { left: Float32Array; right: Float32Array } {
  return {
    left: new Float32Array(frameCount),
    right: new Float32Array(frameCount),
  };
}

function panGains(pan: number): { left: number; right: number } {
  const normalized = clamp(pan, -1, 1);
  const angle = ((normalized + 1) * Math.PI) / 4;
  return {
    left: Math.cos(angle),
    right: Math.sin(angle),
  };
}

function addStereoSample(
  buffer: { left: Float32Array; right: Float32Array },
  frameIndex: number,
  sample: number,
  gain: number,
  pan: number
): void {
  const panned = panGains(pan);
  const value = sample * gain;
  buffer.left[frameIndex] += value * panned.left;
  buffer.right[frameIndex] += value * panned.right;
}

function encodeWavBlob(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number = DEFAULT_RENDER_SAMPLE_RATE
): Blob {
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
    const l = clamp(left[i] ?? 0, -1, 1);
    const r = clamp(right[i] ?? 0, -1, 1);
    view.setInt16(offset, Math.round(l * 0x7fff), true);
    offset += 2;
    view.setInt16(offset, Math.round(r * 0x7fff), true);
    offset += 2;
  }

  return new Blob([out], { type: 'audio/wav' });
}

function renderLoopStem(
  project: BeatProject,
  loop: BeatProject['loops'][number],
  sampleRate: number,
  frameCount: number
): { left: Float32Array; right: Float32Array } {
  const buffer = createStereoBuffer(frameCount);
  const loopMeta = SAMPLE_LOOPS.find((sample) => sample.id === loop.loopId);
  if (!loopMeta || loop.muted) return buffer;

  const seed = hashString(`${project.id}:${loop.id}:${loop.loopId}:${loop.trackNumber}`);
  const baseFrequency = 48 + (seed % 10) * 12;
  const cycleSeconds = Math.max(loopMeta.duration, 60 / project.bpm * 4);
  const sweepRate = 0.15 + ((seed >> 3) % 8) * 0.03;
  const phaseOffset = ((seed >> 5) % 1024) / 1024 * TWO_PI;
  const amplitude = clamp(loop.volume, 0, 2);
  const loopType = loopMeta.category;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const cyclePosition = (time % cycleSeconds) / cycleSeconds;
    const beatPosition = (time * project.bpm) / 60;
    let sample = 0;

    if (loopType === 'bass') {
      const sub = Math.sin(TWO_PI * baseFrequency * time + phaseOffset);
      const motion = 0.65 + 0.35 * Math.sin(TWO_PI * sweepRate * time + phaseOffset * 0.25);
      sample = sub * motion * 0.9;
    } else if (loopType === 'drums') {
      const kick = Math.exp(-Math.pow((beatPosition % 4) - 0, 2) / 0.02) * 0.9;
      const snare = Math.exp(-Math.pow((beatPosition % 4) - 2, 2) / 0.015) * 0.6;
      const hat = Math.exp(-Math.pow((beatPosition * 2) % 1, 2) / 0.002) * 0.18;
      const noise = (Math.sin(time * 7891.13 + phaseOffset) + Math.sin(time * 9137.77)) * 0.02;
      sample = kick + snare + hat + noise;
    } else {
      const fundamental = Math.sin(TWO_PI * baseFrequency * time + phaseOffset);
      const harmonic = Math.sin(TWO_PI * baseFrequency * 2 * time + phaseOffset * 0.7) * 0.35;
      const shimmer = Math.sin(TWO_PI * baseFrequency * 4 * time + phaseOffset * 1.3) * 0.12;
      const saw = (2 * ((time * baseFrequency + cyclePosition) % 1)) - 1;
      const envelope = 0.55 + 0.45 * Math.sin(TWO_PI * cyclePosition);
      sample = (fundamental + harmonic + shimmer + saw * 0.15) * envelope * 0.7;
    }

    const fadeIn = Math.min(1, time / 0.05);
    const fadeOut = Math.min(1, (cycleSeconds - (time % cycleSeconds)) / 0.05);
    const shape = clamp(fadeIn * fadeOut, 0, 1);
    addStereoSample(buffer, frame, sample * shape, amplitude, loop.pan);
  }

  return buffer;
}

function renderDrumStem(
  project: BeatProject,
  drum: DrumSequence,
  sampleRate: number,
  frameCount: number
): { left: Float32Array; right: Float32Array } {
  const buffer = createStereoBuffer(frameCount);
  if (drum.muted || drum.pattern.length === 0) return buffer;

  const seed = hashString(`${project.id}:${drum.trackId}:${drum.instrument}`);
  const barSeconds = (60 / project.bpm) * 4;
  const velocityScale = 0.12 + ((seed >> 7) % 8) * 0.01;
  const pan =
    drum.instrument === 'kick' ? 0 :
    drum.instrument === 'snare' ? -0.1 :
    drum.instrument === 'clap' ? 0.15 :
    drum.instrument === 'hihat' ? 0.35 :
    drum.instrument === 'tom' ? -0.25 :
    0.05;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const barPosition = time % barSeconds;
    let sample = 0;

    for (const event of drum.pattern) {
      const eventTime = (event.step / 16) * barSeconds;
      const diff = barPosition - eventTime;
      const transient = Math.exp(-(diff * diff) / 0.0015);
      const velocity = clamp(event.velocity / 127, 0, 1);

      if (drum.instrument === 'kick') {
        sample += Math.sin(TWO_PI * (54 + (seed % 10)) * diff) * transient * velocity * 1.1;
      } else if (drum.instrument === 'snare' || drum.instrument === 'clap') {
        const tone = Math.sin(TWO_PI * (180 + (seed % 60)) * diff) * transient * velocity * 0.35;
        const noise = (Math.sin(diff * 9000 + seed) + Math.sin(diff * 12000 + seed * 0.5)) * transient * velocity * 0.18;
        sample += tone + noise;
      } else if (drum.instrument === 'hihat') {
        const noise = (Math.sin(diff * 18000 + seed) + Math.sin(diff * 22000 + seed * 0.5)) * transient * velocity * 0.12;
        sample += noise;
      } else {
        sample += Math.sin(TWO_PI * (110 + (seed % 40)) * diff) * transient * velocity * 0.25;
      }
    }

    addStereoSample(buffer, frame, sample * velocityScale, drum.muted ? 0 : 1, pan);
  }

  return buffer;
}

function renderProjectBounce(project: BeatProject, sampleRate: number = DEFAULT_RENDER_SAMPLE_RATE): { left: Float32Array; right: Float32Array } {
  const durationSeconds = Math.max(project.bars * 4 * (60 / project.bpm), 4);
  const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const master = createStereoBuffer(frameCount);

  for (const loop of project.loops) {
    const stem = renderLoopStem(project, loop, sampleRate, frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      master.left[frame] += stem.left[frame];
      master.right[frame] += stem.right[frame];
    }
  }

  for (const drum of project.drums) {
    const stem = renderDrumStem(project, drum, sampleRate, frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      master.left[frame] += stem.left[frame];
      master.right[frame] += stem.right[frame];
    }
  }

  let maxMagnitude = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    maxMagnitude = Math.max(maxMagnitude, Math.abs(master.left[frame]), Math.abs(master.right[frame]));
  }
  const normalization = maxMagnitude > 0.98 ? 0.98 / maxMagnitude : 1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    master.left[frame] = clamp(master.left[frame] * normalization, -1, 1);
    master.right[frame] = clamp(master.right[frame] * normalization, -1, 1);
  }

  return master;
}

export const beatCreationService = {
  /**
   * Get all available loop samples
   */
  getLoops(filters?: { genre?: string; category?: string; bpm?: number }): LoopSample[] {
    let results = [...SAMPLE_LOOPS];

    if (filters?.genre) {
      results = results.filter((l) => l.genre === filters.genre);
    }
    if (filters?.category) {
      results = results.filter((l) => l.category === filters.category);
    }
    if (filters?.bpm) {
      // Find loops close to target BPM (within ±5%)
      const tolerance = filters.bpm * 0.05;
      results = results.filter((l) => Math.abs(l.bpm - filters.bpm) <= tolerance);
    }

    return results;
  },

  /**
   * Get recommended loops for a vocal BPM/genre
   */
  recommendLoops(vocalBpm: number, genre?: string): LoopSample[] {
    return this.getLoops({ bpm: vocalBpm, genre });
  },

  /**
   * Create a new beat project
   */
  createProject(name: string, bpm: number, key: string): BeatProject {
    return {
      id: `beat-${Date.now()}`,
      name,
      bpm,
      key,
      bars: 8,
      loops: [],
      drums: [],
      createdAt: new Date(),
      lastModified: new Date(),
    };
  },

  /**
   * Add loop to project
   */
  addLoop(project: BeatProject, loopId: string, trackNumber: number): BeatProject {
    const loop = SAMPLE_LOOPS.find((l) => l.id === loopId);
    if (!loop) return project;

    const newProject = { ...project };
    newProject.loops.push({
      id: `track-${Date.now()}`,
      loopId,
      trackNumber,
      volume: 1.0,
      pan: 0,
      muted: false,
    });
    newProject.lastModified = new Date();

    return newProject;
  },

  /**
   * Update loop properties (volume, pan, mute)
   */
  updateLoop(
    project: BeatProject,
    loopTrackId: string,
    updates: { volume?: number; pan?: number; muted?: boolean }
  ): BeatProject {
    const newProject = { ...project };
    const loopIndex = newProject.loops.findIndex((l) => l.id === loopTrackId);

    if (loopIndex >= 0) {
      newProject.loops[loopIndex] = {
        ...newProject.loops[loopIndex],
        ...updates,
      };
    }

    newProject.lastModified = new Date();
    return newProject;
  },

  /**
   * Calculate tempo change ratio (for matching vocal BPM)
   */
  getTempoRatio(loopBpm: number, targetBpm: number): number {
    return targetBpm / loopBpm;
  },

  /**
   * Sync loop to target BPM (returns playback rate multiplier)
   */
  syncToBpm(loopBpm: number, targetBpm: number): number {
    return this.getTempoRatio(loopBpm, targetBpm);
  },

  /**
   * Export beat as stereo bounce
   * Renders the project state into a deterministic synthetic bounce and encodes a valid WAV file.
   */
  async exportBeat(project: BeatProject): Promise<Blob> {
    const bounce = renderProjectBounce(project);
    return encodeWavBlob(bounce.left, bounce.right);
  },

  /**
   * Export stems (each loop as separate track for mixing)
   */
  async exportStems(project: BeatProject): Promise<Array<{ name: string; blob: Blob }>> {
    const durationSeconds = Math.max(project.bars * 4 * (60 / project.bpm), 4);
    const sampleRate = DEFAULT_RENDER_SAMPLE_RATE;
    const frameCount = Math.max(1, Math.ceil(durationSeconds * sampleRate));
    const exports: Array<{ name: string; blob: Blob }> = [];

    for (const loop of project.loops) {
      const loopMeta = SAMPLE_LOOPS.find((sample) => sample.id === loop.loopId);
      if (!loopMeta) continue;
      const stem = renderLoopStem(project, loop, sampleRate, frameCount);
      exports.push({
        name: `${loop.trackNumber.toString().padStart(2, '0')}-${loopMeta.name}.wav`,
        blob: encodeWavBlob(stem.left, stem.right, sampleRate),
      });
    }

    for (const drum of project.drums) {
      const stem = renderDrumStem(project, drum, sampleRate, frameCount);
      exports.push({
        name: `${drum.trackId}-${drum.instrument}.wav`,
        blob: encodeWavBlob(stem.left, stem.right, sampleRate),
      });
    }

    return exports;
  },

  /**
   * Get drum kit
   */
  getDrumKit(kitName: keyof typeof DRUM_KITS) {
    return DRUM_KITS[kitName];
  },
};
