export async function applyPhraseRider(vocalBuffer: AudioBuffer, targetLUFS: number): Promise<AudioBuffer> {
  const sampleRate = vocalBuffer.sampleRate;
  const numChannels = vocalBuffer.numberOfChannels;
  
  const offlineCtx = new OfflineAudioContext(numChannels, vocalBuffer.length, sampleRate);
  const leveledBuffer = offlineCtx.createBuffer(numChannels, vocalBuffer.length, sampleRate);
  
  // Settings based on instructions
  const windowMs = 300;
  const windowSamples = Math.floor((windowMs / 1000) * sampleRate);
  const attackSamples = Math.floor((50 / 1000) * sampleRate);
  const releaseSamples = Math.floor((200 / 1000) * sampleRate);
  
  // Noise gate threshold: -45dB
  const noiseGateDb = -45;
  const noiseGateLinear = Math.pow(10, noiseGateDb / 20);
  
  // Approximate LUFS to RMS for a mono vocal
  const targetRMS = Math.pow(10, targetLUFS / 20);
  
  for (let ch = 0; ch < numChannels; ch++) {
    const input = vocalBuffer.getChannelData(ch);
    const output = leveledBuffer.getChannelData(ch);
    
    const numWindows = Math.ceil(input.length / windowSamples);
    const windowRms = new Float32Array(numWindows);
    
    // Calculate RMS per 300ms window
    for (let w = 0; w < numWindows; w++) {
      const start = w * windowSamples;
      const end = Math.min(start + windowSamples, input.length);
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += input[i] * input[i];
      }
      windowRms[w] = Math.sqrt(sum / (end - start));
    }
    
    // Calculate target gains per window
    const targetGains = new Float32Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      const rms = windowRms[w] ?? 0;
      if (rms > noiseGateLinear) {
        targetGains[w] = targetRMS / rms;
      } else {
        // Do not amplify silence
        targetGains[w] = 1.0; 
      }
    }
    
    let currentGain = 1.0;
    
    // Apply dynamic envelope with smoothing
    for (let w = 0; w < numWindows; w++) {
      const targetGain = targetGains[w] ?? 1.0;
      const start = w * windowSamples;
      const end = Math.min(start + windowSamples, input.length);
      
      for (let i = start; i < end; i++) {
        if (targetGain > currentGain) {
          currentGain += (targetGain - currentGain) / attackSamples;
        } else {
          currentGain += (targetGain - currentGain) / releaseSamples;
        }
        
        output[i] = (input[i] ?? 0) * currentGain;
      }
    }
  }
  
  return leveledBuffer;
}
