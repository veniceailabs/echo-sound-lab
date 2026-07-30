export interface VocalDiagnosticsReport {
  hasPlosives: boolean;
  plosiveSeverity: number;
  needsDeEssing: boolean;
  sibilanceSeverity: number;
  highNoiseFloor: boolean;
  noiseFloorDb: number;
}

export class VocalDiagnosticsEngine {
  async analyze(vocalBuffer: AudioBuffer): Promise<VocalDiagnosticsReport> {
    const sampleRate = vocalBuffer.sampleRate;
    // We use a 2-channel OfflineAudioContext to filter both bands simultaneously
    // Channel 0: Plosives (20-100Hz)
    // Channel 1: Sibilance (5k-10kHz)
    const offlineCtx = new OfflineAudioContext(2, vocalBuffer.length, sampleRate);
    
    const source = offlineCtx.createBufferSource();
    source.buffer = vocalBuffer;

    const plosiveFilter = offlineCtx.createBiquadFilter();
    plosiveFilter.type = 'bandpass';
    plosiveFilter.frequency.value = 60; // Center of 20-100Hz
    plosiveFilter.Q.value = 1.0;

    const sibilanceFilter = offlineCtx.createBiquadFilter();
    sibilanceFilter.type = 'bandpass';
    sibilanceFilter.frequency.value = 7500; // Center of 5k-10kHz
    sibilanceFilter.Q.value = 1.0;

    const merger = offlineCtx.createChannelMerger(2);
    
    source.connect(plosiveFilter);
    plosiveFilter.connect(merger, 0, 0); // Left channel
    
    source.connect(sibilanceFilter);
    sibilanceFilter.connect(merger, 0, 1); // Right channel

    merger.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    
    // We only need to analyze the primary channel (assuming mono for vocals)
    const plosiveData = renderedBuffer.getChannelData(0);
    const sibilanceData = renderedBuffer.getChannelData(1);
    const origData = vocalBuffer.getChannelData(0);

    let maxPlosiveLevel = 0;
    let sibilanceEnergy = 0;
    let origEnergy = 0;

    const chunkSize = 2048;
    for (let i = 0; i < origData.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, origData.length);
      let pMax = 0;
      let sSum = 0;
      let oSum = 0;

      for (let j = i; j < end; j++) {
        const pVal = Math.abs(plosiveData[j] ?? 0);
        if (pVal > pMax) pMax = pVal;
        
        const sVal = sibilanceData[j] ?? 0;
        sSum += sVal * sVal;
        
        const oVal = origData[j] ?? 0;
        oSum += oVal * oVal;
      }
      
      if (pMax > maxPlosiveLevel) maxPlosiveLevel = pMax;
      sibilanceEnergy += sSum;
      origEnergy += oSum;
    }

    // Noise Floor Check: quietest 500ms segment
    const window500ms = Math.floor(sampleRate * 0.5);
    let minRms = Infinity;

    for (let i = 0; i < origData.length - window500ms; i += window500ms) {
      let sum = 0;
      for (let j = 0; j < window500ms; j++) {
         const v = origData[i+j] ?? 0;
         sum += v * v;
      }
      const rms = Math.sqrt(sum / window500ms);
      if (rms < minRms) minRms = rms;
    }

    const noiseFloorDb = 20 * Math.log10(Math.max(minRms, 1e-10));
    const highNoiseFloor = noiseFloorDb > -45;

    // Calculate severities based on defined thresholds
    const plosiveSeverity = Math.min(maxPlosiveLevel / 0.5, 1.0);
    const hasPlosives = maxPlosiveLevel > 0.3; // Threshold for transient spikes

    const relSibilance = sibilanceEnergy / Math.max(origEnergy, 1e-10);
    const sibilanceSeverity = Math.min(relSibilance / 0.3, 1.0); 
    const needsDeEssing = relSibilance > 0.15;

    return {
      hasPlosives,
      plosiveSeverity,
      needsDeEssing,
      sibilanceSeverity,
      highNoiseFloor,
      noiseFloorDb
    };
  }
}
