/**
 * Standardized Dynamic Range (Loudness Range) calculation used by all
 * preservation checks. Keeping one implementation avoids drift between
 * pre/post render verification passes.
 */
export function calculateLoudnessRange(buffer: AudioBuffer): number {
  const channelData = buffer.getChannelData(0);
  const windowSize = Math.max(1, Math.floor(buffer.sampleRate * 0.4)); // 400ms
  const rmsValuesDb: number[] = [];

  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length);
    let sum = 0;
    for (let j = i; j < end; j++) {
      const sample = channelData[j] ?? 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / Math.max(1, end - i));
    if (rms > 0.0001) {
      rmsValuesDb.push(20 * Math.log10(rms));
    }
  }

  if (rmsValuesDb.length === 0) {
    return 0;
  }

  rmsValuesDb.sort((a, b) => a - b);
  const low = rmsValuesDb[Math.floor(rmsValuesDb.length * 0.05)] ?? rmsValuesDb[0];
  const high = rmsValuesDb[Math.floor(rmsValuesDb.length * 0.95)] ?? rmsValuesDb[rmsValuesDb.length - 1];
  return Math.abs(high - low);
}

