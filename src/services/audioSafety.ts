export interface RenderSafetyReport {
  peakDbfs: number;
  ceilingDbfs: number;
  gainReductionDb: number;
  clampedSamples: number;
}

export const calculateBufferPeakDbfs = (
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'getChannelData'>,
): number => {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -96;
};

export const applyGainToBuffer = (
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'getChannelData'>,
  gainLinear: number,
): number => {
  let clamped = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const sample = data[i] * gainLinear;
      if (!Number.isFinite(sample)) {
        data[i] = 0;
        clamped += 1;
      } else {
        data[i] = sample;
      }
    }
  }
  return clamped;
};

export const evaluateRenderSafety = (
  buffer: Pick<AudioBuffer, 'numberOfChannels' | 'getChannelData'>,
  ceilingDbfs: number = -0.3,
): RenderSafetyReport => {
  const peakDbfs = calculateBufferPeakDbfs(buffer);
  const gainReductionDb = peakDbfs > ceilingDbfs ? peakDbfs - ceilingDbfs : 0;
  return {
    peakDbfs,
    ceilingDbfs,
    gainReductionDb,
    clampedSamples: 0,
  };
};
