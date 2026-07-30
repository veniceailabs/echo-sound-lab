/**
 * chordDetection.ts — Chord progression detection
 *
 * Splits audio into 500ms windows, builds a chromagram per window,
 * then matches each to a chord template (major, minor, dominant 7th,
 * minor 7th, sus2, sus4, diminished, augmented).
 *
 * Returns a timeline of detected chords with timestamps.
 */

export interface ChordEvent {
  timeMs: number;
  durationMs: number;
  chord: string;       // e.g. "C Major", "A Minor", "G7"
  root: string;        // e.g. "C"
  quality: ChordQuality;
  confidence: number;  // 0–1
  chromagram: number[]; // 12 pitches for that window
}

export type ChordQuality =
  | 'major' | 'minor' | 'dom7' | 'maj7' | 'min7'
  | 'sus2' | 'sus4' | 'dim' | 'aug' | 'power';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Chord templates — 1 = note present, 0 = note absent
// Indexed by semitone offset from root
const CHORD_TEMPLATES: Record<ChordQuality, number[]> = {
  major:  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  minor:  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  dom7:   [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  maj7:   [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  min7:   [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
  sus2:   [1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  sus4:   [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
  dim:    [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  aug:    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  power:  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
};

const QUALITY_SYMBOL: Record<ChordQuality, string> = {
  major: '',
  minor: 'm',
  dom7: '7',
  maj7: 'maj7',
  min7: 'm7',
  sus2: 'sus2',
  sus4: 'sus4',
  dim: '°',
  aug: '+',
  power: '5',
};

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function norm(a: number[]): number {
  return Math.sqrt(a.reduce((s, v) => s + v * v, 0));
}

function cosineSim(a: number[], b: number[]): number {
  const d = norm(a) * norm(b);
  return d > 0 ? dotProduct(a, b) / d : 0;
}

/** Build short-time chromagram for a window of samples */
function windowChroma(data: Float32Array, sr: number): number[] {
  const chroma = new Array(12).fill(0);
  const fRef = 32.7; // C1 in Hz
  const hopSize = 256;
  const winSize = Math.min(2048, data.length);

  for (let octave = 1; octave < 7; octave++) {
    for (let pc = 0; pc < 12; pc++) {
      const freq = fRef * Math.pow(2, octave + pc / 12);
      if (freq >= sr / 2) continue;

      let re = 0, im = 0;
      const omega = 2 * Math.PI * freq / sr;
      for (let i = 0; i < winSize && i < data.length; i++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / winSize);
        re += data[i] * w * Math.cos(omega * i);
        im += data[i] * w * Math.sin(omega * i);
      }
      chroma[pc] += Math.sqrt(re * re + im * im);
    }
  }

  // Normalize
  const maxVal = Math.max(...chroma);
  return maxVal > 0 ? chroma.map(v => v / maxVal) : chroma;
}

function matchChord(chroma: number[]): { root: number; quality: ChordQuality; confidence: number } {
  let bestRoot = 0;
  let bestQuality: ChordQuality = 'major';
  let bestSim = -1;

  for (let root = 0; root < 12; root++) {
    for (const [quality, template] of Object.entries(CHORD_TEMPLATES) as [ChordQuality, number[]][]) {
      // Rotate template so root is at position 0
      const rotated = template.map((_, i) => template[(i - root + 12) % 12]);
      const sim = cosineSim(chroma, rotated);
      if (sim > bestSim) {
        bestSim = sim;
        bestRoot = root;
        bestQuality = quality;
      }
    }
  }

  return { root: bestRoot, quality: bestQuality, confidence: Math.max(0, bestSim) };
}

function formatChord(root: number, quality: ChordQuality): string {
  return NOTE_NAMES[root] + QUALITY_SYMBOL[quality];
}

/** Merge consecutive identical chords */
function mergeEvents(events: ChordEvent[]): ChordEvent[] {
  if (events.length === 0) return [];
  const merged: ChordEvent[] = [{ ...events[0] }];
  for (let i = 1; i < events.length; i++) {
    const last = merged[merged.length - 1];
    if (events[i].chord === last.chord && events[i].confidence > 0.4) {
      last.durationMs += events[i].durationMs;
      last.confidence = (last.confidence + events[i].confidence) / 2;
    } else {
      merged.push({ ...events[i] });
    }
  }
  return merged;
}

export function detectChords(buffer: AudioBuffer, windowMs = 500): ChordEvent[] {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;

  // Mono mix
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) mono[i] = (L[i] + R[i]) * 0.5;

  const windowSamples = Math.floor(sr * windowMs / 1000);
  const events: ChordEvent[] = [];
  const totalWindows = Math.floor(mono.length / windowSamples);

  for (let w = 0; w < totalWindows; w++) {
    const start = w * windowSamples;
    const window = mono.subarray(start, start + windowSamples);

    // Skip silent windows
    let rms = 0;
    for (let i = 0; i < window.length; i++) rms += window[i] * window[i];
    rms = Math.sqrt(rms / window.length);
    if (rms < 0.003) continue;

    const chroma = windowChroma(window, sr);
    const { root, quality, confidence } = matchChord(chroma);

    if (confidence > 0.3) {
      events.push({
        timeMs: w * windowMs,
        durationMs: windowMs,
        chord: formatChord(root, quality),
        root: NOTE_NAMES[root],
        quality,
        confidence,
        chromagram: chroma,
      });
    }
  }

  return mergeEvents(events);
}

/** Get unique chord sequence (chord symbols without timing) */
export function getChordProgression(events: ChordEvent[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const e of events) {
    if (!seen.has(e.chord)) {
      seen.add(e.chord);
      order.push(e.chord);
    }
  }
  return order;
}
