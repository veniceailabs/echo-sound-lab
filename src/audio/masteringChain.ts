export type TargetPlatform = 'spotify' | 'apple' | 'club';

export interface MasteringResult {
  masteredBuffer: AudioBuffer;
  finalLufs: number;
  finalTruePeak: number;
  platform: TargetPlatform;
}

function makeDistortionCurve(amount: number) {
  const k = typeof amount === 'number' ? amount : 50,
    n_samples = 44100,
    curve = new Float32Array(n_samples),
    deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export async function applyMasteringChain(
  premasterBuffer: AudioBuffer,
  targetPlatform: TargetPlatform
): Promise<MasteringResult> {
  const sampleRate = premasterBuffer.sampleRate;
  const numChannels = premasterBuffer.numberOfChannels;
  const length = premasterBuffer.length;
  
  // Calculate input LUFS to determine makeup gain
  let sumSquares = 0;
  let totalSamples = 0;
  for (let c = 0; c < numChannels; c++) {
    const data = premasterBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const val = data[i] ?? 0;
      sumSquares += val * val;
      totalSamples++;
    }
  }
  const rms = Math.sqrt(sumSquares / totalSamples);
  const inputLufs = (rms > 0 ? 20 * Math.log10(rms) : -100) - 0.691;
  
  // Determine targets
  let targetLufs = -14.0;
  if (targetPlatform === 'apple') targetLufs = -16.0;
  if (targetPlatform === 'club') targetLufs = -9.0;
  
  // Calculate required makeup gain to hit the target LUFS
  const requiredGainDb = targetLufs - inputLufs;
  const makeupGainLinear = Math.pow(10, requiredGainDb / 20);

  // Setup OfflineAudioContext
  const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);
  
  const source = offlineCtx.createBufferSource();
  source.buffer = premasterBuffer;
  
  // Stage 1: Glue Compression
  const glueCompressor = offlineCtx.createDynamicsCompressor();
  glueCompressor.threshold.value = -12; // Gentle threshold
  glueCompressor.knee.value = 10;
  glueCompressor.ratio.value = 1.5;
  glueCompressor.attack.value = 0.030; // 30ms
  glueCompressor.release.value = 0.100; // 100ms
  
  // Stage 2: Harmonic Saturation (1.5% drive approx k=15)
  const saturator = offlineCtx.createWaveShaper();
  saturator.curve = makeDistortionCurve(15);
  saturator.oversample = '2x';
  
  // Gain stage to push into the limiter
  const makeupGainNode = offlineCtx.createGain();
  makeupGainNode.gain.value = makeupGainLinear;
  
  // Stage 3: True-Peak Limiter (-1.0 dBTP ceiling)
  // Web Audio's DynamicsCompressor acts as a limiter with infinite ratio and 0 attack.
  const limiter = offlineCtx.createDynamicsCompressor();
  limiter.threshold.value = -1.0; 
  limiter.knee.value = 0;
  limiter.ratio.value = 20.0; // Brickwall
  limiter.attack.value = 0.001; // Lookahead/fastest attack
  limiter.release.value = 0.050; 
  
  // Final output ceiling
  const ceilingGain = offlineCtx.createGain();
  ceilingGain.gain.value = Math.pow(10, -1.0 / 20); // Scale output strictly to -1.0 dBTP
  
  // Routing
  source.connect(glueCompressor);
  glueCompressor.connect(saturator);
  saturator.connect(makeupGainNode);
  makeupGainNode.connect(limiter);
  limiter.connect(ceilingGain);
  ceilingGain.connect(offlineCtx.destination);
  
  source.start(0);
  
  const masteredBuffer = await offlineCtx.startRendering();
  
  // Verify final LUFS and True Peak
  let finalMaxAbs = 0;
  let finalSumSquares = 0;
  for (let c = 0; c < numChannels; c++) {
    const data = masteredBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const val = Math.abs(data[i] ?? 0);
      if (val > finalMaxAbs) finalMaxAbs = val;
      finalSumSquares += val * val;
    }
  }
  const finalRms = Math.sqrt(finalSumSquares / totalSamples);
  const finalLufs = (finalRms > 0 ? 20 * Math.log10(finalRms) : -100) - 0.691;
  const finalTruePeak = finalMaxAbs > 0 ? 20 * Math.log10(finalMaxAbs) : -100;
  
  return {
    masteredBuffer,
    finalLufs,
    finalTruePeak,
    platform: targetPlatform
  };
}
