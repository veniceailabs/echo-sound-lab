import { lufsMeteringService } from './lufsMetering';
import { mixAnalysisService } from './mixAnalysis';

export interface PremasterCheckpoint {
  checkpointId: string;
  generatedAt: string;
  manifestHash: string;
  approvedForMastering: boolean;
  requirements: {
    noClipping: boolean;
    headroomOk: boolean;
    lraOk: boolean;
  };
  blockingReasons: string[];
  metrics: {
    integratedLufs: number;
    truePeakDb: number;
    samplePeakDb: number;
    loudnessRangeLu: number;
    headroomDb: number;
    clippingPercent: number;
  };
}

const PREMASTER_TRUE_PEAK_TARGET_DBTP = -6.0;
const PREMASTER_MIN_LRA_LU = 6.0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function hashBufferPayload(parts: Array<string | Uint8Array | ArrayBuffer>): Promise<string> {
  const encoder = new TextEncoder();
  const buffers = parts.map((part) => {
    if (typeof part === 'string') return encoder.encode(part);
    if (part instanceof Uint8Array) return part;
    return new Uint8Array(part);
  });

  const total = buffers.reduce((sum, item) => sum + item.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const item of buffers) {
    merged.set(item, offset);
    offset += item.length;
  }

  const digest = await crypto.subtle.digest('SHA-256', merged);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function countClippedSamples(buffer: AudioBuffer): number {
  let clipped = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      if (Math.abs(data[i]) >= 0.9999) {
        clipped += 1;
      }
    }
  }
  return clipped;
}

function buildFingerprintWindow(buffer: AudioBuffer): Uint8Array {
  const sampleWindow = Math.min(buffer.length, Math.max(2048, Math.floor(buffer.sampleRate * 10)));
  const maxChannels = Math.min(buffer.numberOfChannels, 2);
  const out = new Int16Array(sampleWindow * maxChannels);
  let offset = 0;

  for (let channel = 0; channel < maxChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < sampleWindow; i += 1) {
      out[offset] = Math.round(clamp(data[i] ?? 0, -1, 1) * 32767);
      offset += 1;
    }
  }

  return new Uint8Array(out.buffer);
}

export async function buildPremasterCheckpoint(
  buffer: AudioBuffer,
  options: {
    fileName?: string | null;
    sourceFileBytes?: ArrayBuffer | null;
  } = {},
): Promise<PremasterCheckpoint> {
  const loudness = await lufsMeteringService.measureLUFS(buffer);
  const staticMetrics = mixAnalysisService.analyzeStaticMetrics(buffer);
  const clippedSamples = countClippedSamples(buffer);
  const totalSamples = Math.max(1, buffer.length * Math.max(1, buffer.numberOfChannels));
  const clippingPercent = clippedSamples / totalSamples;
  const headroomDb = PREMASTER_TRUE_PEAK_TARGET_DBTP - loudness.truePeak;
  const requirements = {
    noClipping: clippedSamples === 0 && loudness.truePeak < 0,
    headroomOk: headroomDb >= 0,
    lraOk: loudness.loudnessRange >= PREMASTER_MIN_LRA_LU,
  };

  const blockingReasons: string[] = [];
  if (!requirements.noClipping) {
    blockingReasons.push('Premaster clips before mastering. Lower the source level before printing a master.');
  }
  if (!requirements.headroomOk) {
    blockingReasons.push(`Premaster true peak is ${loudness.truePeak.toFixed(2)} dBTP. Leave at least 6 dB of headroom.`);
  }
  if (!requirements.lraOk) {
    blockingReasons.push(`Premaster loudness range is ${loudness.loudnessRange.toFixed(2)} LU. The mix is too pinned before mastering.`);
  }

  const manifestHash = await hashBufferPayload([
    options.fileName || 'untitled',
    options.sourceFileBytes || buildFingerprintWindow(buffer),
    JSON.stringify({
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      length: buffer.length,
      integratedLufs: Number.isFinite(loudness.integratedLUFS) ? Number(loudness.integratedLUFS.toFixed(4)) : loudness.integratedLUFS,
      truePeak: Number.isFinite(loudness.truePeak) ? Number(loudness.truePeak.toFixed(4)) : loudness.truePeak,
      loudnessRange: Number.isFinite(loudness.loudnessRange) ? Number(loudness.loudnessRange.toFixed(4)) : loudness.loudnessRange,
      samplePeak: Number.isFinite(staticMetrics.peak) ? Number(staticMetrics.peak.toFixed(4)) : staticMetrics.peak,
    }),
  ]);

  return {
    checkpointId: manifestHash.slice(0, 24),
    generatedAt: new Date().toISOString(),
    manifestHash,
    approvedForMastering: blockingReasons.length === 0,
    requirements,
    blockingReasons,
    metrics: {
      integratedLufs: loudness.integratedLUFS,
      truePeakDb: loudness.truePeak,
      samplePeakDb: staticMetrics.peak,
      loudnessRangeLu: loudness.loudnessRange,
      headroomDb,
      clippingPercent,
    },
  };
}
