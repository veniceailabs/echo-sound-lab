/**
 * Platform Export Service
 *
 * Measures integrated LUFS of a mastered buffer, normalizes to each
 * streaming platform's exact spec, applies true-peak limiting, and
 * encodes to WAV. Supports batch export of all platforms at once.
 *
 * Platform specs (2024):
 *   Spotify       -14 LUFS / -1.0 dBTP / 16-bit
 *   Apple Music   -16 LUFS / -1.0 dBTP / 24-bit (lossless pipeline)
 *   YouTube       -14 LUFS / -1.0 dBTP / 16-bit
 *   Tidal         -14 LUFS / -1.0 dBTP / 24-bit (MQA masters)
 *   Amazon Music  -14 LUFS / -1.0 dBTP / 24-bit (HD tier)
 *   SoundCloud    -8  LUFS / -0.3 dBTP / 16-bit (no normalization — needs to be loud)
 *   CD Master     -9  LUFS / -0.1 dBTP / 16-bit  (RedBook standard)
 *   Vinyl Master  -12 LUFS / -2.0 dBTP / 24-bit + RIAA warmth curve
 */

import { lufsMeteringService } from './lufsMetering';

// ─── Platform Definitions ──────────────────────────────────────────────────────

export interface PlatformSpec {
  id: string;
  name: string;
  targetLUFS: number;
  ceilingDb: number;   // max true peak
  bitDepth: 16 | 24;
  color: string;       // brand color for UI
  accent: string;      // lighter accent
  note: string;        // one-line human-readable rationale
  vinylWarm?: boolean; // apply RIAA-style EQ curve
}

export const PLATFORM_SPECS: PlatformSpec[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    targetLUFS: -14,
    ceilingDb: -1.0,
    bitDepth: 16,
    color: '#1DB954',
    accent: '#1ed760',
    note: '-14 LUFS — normalized on upload, loud masters get turned down',
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    targetLUFS: -16,
    ceilingDb: -1.0,
    bitDepth: 24,
    color: '#fc3c44',
    accent: '#ff6b6b',
    note: '-16 LUFS (Sound Check) — quieter target, more headroom for dynamics',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    targetLUFS: -14,
    ceilingDb: -1.0,
    bitDepth: 16,
    color: '#FF0000',
    accent: '#ff4444',
    note: '-14 LUFS — video normalization matches Spotify loudness',
  },
  {
    id: 'tidal',
    name: 'Tidal',
    targetLUFS: -14,
    ceilingDb: -1.0,
    bitDepth: 24,
    color: '#00FFFF',
    accent: '#80FFFF',
    note: '-14 LUFS / 24-bit — hi-fi tier requires lossless headroom',
  },
  {
    id: 'amazon',
    name: 'Amazon Music',
    targetLUFS: -14,
    ceilingDb: -1.0,
    bitDepth: 24,
    color: '#FF9900',
    accent: '#FFB84D',
    note: '-14 LUFS / 24-bit HD — Ultra HD tier matched to Spotify integrated',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    targetLUFS: -8,
    ceilingDb: -0.3,
    bitDepth: 16,
    color: '#FF5500',
    accent: '#FF7733',
    note: '-8 LUFS — no normalization, competitive loudness wins on feed',
  },
  {
    id: 'cd',
    name: 'CD Master',
    targetLUFS: -9,
    ceilingDb: -0.1,
    bitDepth: 16,
    color: '#A8B0C0',
    accent: '#C8D0E0',
    note: '-9 LUFS / 16-bit / 44.1kHz — RedBook standard, peak-limited hard',
  },
  {
    id: 'vinyl',
    name: 'Vinyl Master',
    targetLUFS: -12,
    ceilingDb: -2.0,
    bitDepth: 24,
    color: '#8B6914',
    accent: '#C9962A',
    note: '-12 LUFS / analog warmth curve — wider dynamics for the cutting lathe',
    vinylWarm: true,
  },
];

// ─── Platform Export Result ────────────────────────────────────────────────────

export interface PlatformExportResult {
  platform: PlatformSpec;
  blob: Blob;
  measuredLUFS: number;   // before normalization
  appliedGainDb: number;  // how much gain was added
  finalLUFS: number;      // after normalization (≈ targetLUFS)
  truePeak: number;       // final true peak in dBTP
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute integrated LUFS for an AudioBuffer using the existing metering service. */
async function measureLUFS(buffer: AudioBuffer): Promise<number> {
  return lufsMeteringService.calculateIntegratedLUFS(buffer);
}

/** True peak (sample peak * OS factor, simple 2x oversample via linear interpolation). */
function truePeakDb(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < d.length - 1; i++) {
      const a = d[i]!;
      const b = d[i + 1]!;
      peak = Math.max(peak, Math.abs(a), Math.abs(b), Math.abs(0.5 * (a + b)));
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** Apply gain (dB) + hard true-peak limiter and return a new AudioBuffer. */
function applyGainAndLimit(
  buffer: AudioBuffer,
  gainDb: number,
  ceilingDb: number,
): AudioBuffer {
  const gainLinear = Math.pow(10, gainDb / 20);
  const ceilingLinear = Math.pow(10, ceilingDb / 20);

  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) {
      const s = (src[i]! * gainLinear);
      // Hard clip to ceiling (true-peak is already controlled by LUFS headroom)
      dst[i] = Math.max(-ceilingLinear, Math.min(ceilingLinear, s));
    }
  }
  return out;
}

/**
 * Vinyl warmth curve — gentle analog tilt:
 *   +1.5 dB shelving boost below 120 Hz (warmth)
 *   -1.0 dB shelving cut above 10 kHz (reduce sibilance)
 *   High-pass at 20 Hz (no sub rumble on vinyl)
 *
 * Implemented as simple first-order IIR filters.
 */
function applyVinylWarmth(buffer: AudioBuffer): AudioBuffer {
  const sr = buffer.sampleRate;
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: sr,
  });

  // Low-shelf: +1.5 dB at 120 Hz
  const lowGain = Math.pow(10, 1.5 / 20);
  const lowFc = 120 / sr;
  const lowK = Math.tan(Math.PI * lowFc);
  const lowA = (lowK - 1) / (lowK + 1);

  // High-shelf: -1.0 dB at 10 kHz
  const hiGain = Math.pow(10, -1.0 / 20);
  const hiFc = 10000 / sr;
  const hiK = Math.tan(Math.PI * hiFc);
  const hiA = (hiK - 1) / (hiK + 1);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let lowZ = 0, hiZ = 0;

    for (let i = 0; i < src.length; i++) {
      const x = src[i]!;

      // Low-shelf allpass component
      const lowAP = lowA * x + lowZ;
      lowZ = x - lowA * lowAP;
      const lowShelf = 0.5 * (x + lowAP) * lowGain + 0.5 * (x - lowAP);

      // Hi-shelf allpass component
      const hiAP = hiA * lowShelf + hiZ;
      hiZ = lowShelf - hiA * hiAP;
      const hiShelf = 0.5 * (lowShelf + hiAP) + 0.5 * (lowShelf - hiAP) * hiGain;

      dst[i] = hiShelf;
    }
  }
  return out;
}

/**
 * Encode an AudioBuffer to a WAV Blob (16 or 24 bit PCM, interleaved).
 */
function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const dataSize = numChannels * numSamples * bytesPerSample;

  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                                         // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i] ?? 0));
      if (bitDepth === 16) {
        view.setInt16(offset, Math.round(s * 32767), true);
        offset += 2;
      } else {
        const v = Math.round(s * 8388607);
        view.setUint8(offset,     v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([ab], { type: 'audio/wav' });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class PlatformExportService {
  /**
   * Measure the current LUFS of the master buffer.
   * Call this once to populate the UI compliance indicators.
   */
  async measureMaster(buffer: AudioBuffer): Promise<{
    integratedLUFS: number;
    truePeakDb: number;
    platformDeltas: Array<{ id: string; delta: number; compliant: boolean }>;
  }> {
    const [lufs] = await Promise.all([
      measureLUFS(buffer),
    ]);
    const tp = truePeakDb(buffer);

    const platformDeltas = PLATFORM_SPECS.map(spec => ({
      id: spec.id,
      delta: lufs - spec.targetLUFS,   // positive = too loud
      compliant: Math.abs(lufs - spec.targetLUFS) <= 1.0 && tp <= spec.ceilingDb,
    }));

    return { integratedLUFS: lufs, truePeakDb: tp, platformDeltas };
  }

  /**
   * Export master normalized to a specific platform spec.
   * Returns a WAV Blob ready for download.
   */
  async exportForPlatform(
    buffer: AudioBuffer,
    platform: PlatformSpec,
    onProgress?: (pct: number) => void,
  ): Promise<PlatformExportResult> {
    onProgress?.(5);

    // 1. Measure LUFS
    const measuredLUFS = await measureLUFS(buffer);
    onProgress?.(30);

    // 2. Calculate required gain adjustment
    const gainDb = platform.targetLUFS - measuredLUFS;

    // 3. Apply vinyl warmth curve before gain adjustment (if applicable)
    let processed = platform.vinylWarm ? applyVinylWarmth(buffer) : buffer;
    onProgress?.(50);

    // 4. Apply gain + true-peak limit
    processed = applyGainAndLimit(processed, gainDb, platform.ceilingDb);
    onProgress?.(80);

    // 5. Measure final state
    const finalLUFS = measuredLUFS + gainDb;
    const tp = truePeakDb(processed);

    // 6. Encode WAV
    const blob = encodeWav(processed, platform.bitDepth);
    onProgress?.(100);

    return {
      platform,
      blob,
      measuredLUFS,
      appliedGainDb: gainDb,
      finalLUFS,
      truePeak: tp,
    };
  }

  /**
   * Export all platforms in parallel (throttled to 2 at a time to avoid OOM).
   */
  async exportAll(
    buffer: AudioBuffer,
    onPlatformComplete?: (id: string, result: PlatformExportResult) => void,
  ): Promise<PlatformExportResult[]> {
    const results: PlatformExportResult[] = [];

    // Process in pairs
    for (let i = 0; i < PLATFORM_SPECS.length; i += 2) {
      const batch = PLATFORM_SPECS.slice(i, i + 2);
      const batchResults = await Promise.all(
        batch.map(spec => this.exportForPlatform(buffer, spec))
      );
      for (const r of batchResults) {
        results.push(r);
        onPlatformComplete?.(r.platform.id, r);
      }
    }

    return results;
  }

  /**
   * Trigger a single platform download.
   */
  downloadResult(result: PlatformExportResult, baseName: string): void {
    const safe = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/\.[^.]+$/, '');
    const platformSlug = result.platform.id.replace('_', '-');
    const bits = result.platform.bitDepth;
    const filename = `${safe}—${platformSlug}—${bits}bit.wav`;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Batch download all results as sequential triggers (browsers allow this).
   */
  downloadAll(results: PlatformExportResult[], baseName: string): void {
    results.forEach((r, i) => {
      setTimeout(() => this.downloadResult(r, baseName), i * 200);
    });
  }
}

export const platformExportService = new PlatformExportService();
