export type LoudnessVariantId = 'streaming_safe' | 'balanced' | 'competitive';

export interface LoudnessVariantSpec {
  id: LoudnessVariantId;
  label: string;
  gainDb: number;
  fileSuffix: string;
  summary: string;
}

export const LOUDNESS_VARIANT_SPECS: LoudnessVariantSpec[] = [
  {
    id: 'streaming_safe',
    label: 'Streaming Safe',
    gainDb: -1.0,
    fileSuffix: 'streaming-safe',
    summary: 'A slightly softer export for translation-heavy playback.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    gainDb: 0,
    fileSuffix: 'balanced',
    summary: 'The current master gain, preserved as-is.',
  },
  {
    id: 'competitive',
    label: 'Competitive',
    gainDb: 1.0,
    fileSuffix: 'competitive',
    summary: 'A slightly louder variant for comparison, clamped to safe headroom.',
  },
];

function peakAbs(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const abs = Math.abs(data[index]);
      if (abs > peak) peak = abs;
    }
  }
  return peak;
}

export function cloneBufferWithGain(buffer: AudioBuffer, requestedGainDb: number, ceilingDb = -1): AudioBuffer {
  const gainLinear = Math.pow(10, requestedGainDb / 20);
  const safePeak = Math.pow(10, ceilingDb / 20);
  const maxPeak = peakAbs(buffer);
  const safeGain = maxPeak > 0 ? Math.min(gainLinear, safePeak / maxPeak) : gainLinear;
  const output = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const input = buffer.getChannelData(channel);
    const target = output.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) {
      target[index] = input[index] * safeGain;
    }
  }

  return output;
}

export function resolveVariantFilename(baseName: string, variant: LoudnessVariantSpec, extension = 'wav'): string {
  const safeBase = baseName.replace(/\.[^.]+$/, '') || 'export';
  return `${safeBase}-${variant.fileSuffix}.${extension}`;
}
