import { createMultibandSplit } from './frequencySplitter';

export async function applyVocalDucking(
  instrumentalBuffer: AudioBuffer,
  vocalBuffer: AudioBuffer
): Promise<{ duckedBuffer: AudioBuffer; maxReductionDb: number }> {
  const sampleRate = instrumentalBuffer.sampleRate;
  const numChannels = instrumentalBuffer.numberOfChannels;
  const length = instrumentalBuffer.length;
  
  // 1. Create an OfflineAudioContext to process the ducking
  const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);

  // 2. Setup Sources
  const instSource = offlineCtx.createBufferSource();
  instSource.buffer = instrumentalBuffer;

  // 3. Frequency Splitter for Instrumental
  const bands = createMultibandSplit(offlineCtx, instSource);

  // 4. Create the ducking GainNode for the Mid Band (Vocal Pocket)
  const duckingGain = offlineCtx.createGain();
  duckingGain.gain.value = 1.0; // Default unity gain
  
  bands.midBand.connect(duckingGain);

  // 5. Recombine the bands
  duckingGain.connect(offlineCtx.destination);
  bands.lowBand.connect(offlineCtx.destination);
  bands.highBand.connect(offlineCtx.destination);

  // 6. Extract Vocal Amplitude Envelope and compute Gain Reduction
  // We'll calculate a fast RMS envelope of the vocal to automate the duckingGain
  const attackTime = 0.005; // 5ms
  const releaseTime = 0.100; // 100ms
  const ratio = 3.0;
  const thresholdDb = -30; // Duck when vocal is louder than -30dBFS
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  
  const vocalData = vocalBuffer.getChannelData(0); // Use mono vocal for sidechain detection
  
  // We'll generate an automation curve for the GainNode
  // Processing in chunks (e.g., 256 samples) for efficiency
  const chunkSize = 256;
  const numChunks = Math.ceil(length / chunkSize);
  const gainCurve = new Float32Array(numChunks);
  
  let currentEnv = 0;
  let maxReductionLinear = 1.0;

  // Attack and Release coefficients
  const attackCoeff = Math.exp(-1.0 / (sampleRate * attackTime));
  const releaseCoeff = Math.exp(-1.0 / (sampleRate * releaseTime));

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, length);
    
    // Compute peak/RMS for this chunk
    let chunkPeak = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(vocalData[j] ?? 0);
      if (val > chunkPeak) chunkPeak = val;
    }
    
    // Smooth the envelope detector
    if (chunkPeak > currentEnv) {
      currentEnv = attackCoeff * currentEnv + (1 - attackCoeff) * chunkPeak;
    } else {
      currentEnv = releaseCoeff * currentEnv + (1 - releaseCoeff) * chunkPeak;
    }
    
    // Calculate gain reduction if over threshold
    let gainReduction = 1.0;
    if (currentEnv > thresholdLinear) {
      const envDb = 20 * Math.log10(currentEnv);
      // Compression calculation: outDb = threshold + (envDb - threshold) / ratio
      // Delta = envDb - outDb = (envDb - threshold) * (1 - 1/ratio)
      const reductionDb = (envDb - thresholdDb) * (1 - 1.0 / ratio);
      gainReduction = Math.pow(10, -reductionDb / 20);
    }
    
    gainCurve[i] = gainReduction;
    if (gainReduction < maxReductionLinear) {
      maxReductionLinear = gainReduction;
    }
  }

  // 7. Apply the automation curve to the duckingGain
  duckingGain.gain.setValueCurveAtTime(gainCurve, 0, length / sampleRate);

  // 8. Render the ducked instrumental
  instSource.start(0);
  const duckedBuffer = await offlineCtx.startRendering();

  const maxReductionDb = maxReductionLinear < 1.0 
    ? 20 * Math.log10(maxReductionLinear) 
    : 0;

  return { duckedBuffer, maxReductionDb };
}
