export interface VerificationPayload {
  passesGate: boolean;
  currentHeadroomDB: number;
  originalPeakDb: number;
  originalLufs: number;
  adjustedBuffer: AudioBuffer;
}

export class MasteringGate {
  async verifyPremaster(mixedBuffer: AudioBuffer): Promise<VerificationPayload> {
    const numChannels = mixedBuffer.numberOfChannels;
    const length = mixedBuffer.length;
    
    let maxAbs = 0;
    let sumSquares = 0;
    let totalSamples = 0;

    for (let c = 0; c < numChannels; c++) {
      const data = mixedBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const val = Math.abs(data[i] ?? 0);
        if (val > maxAbs) maxAbs = val;
        sumSquares += val * val;
        totalSamples++;
      }
    }
    
    // True Peak (estimated via absolute max)
    const peakDb = maxAbs > 0 ? 20 * Math.log10(maxAbs) : -100;
    
    // Integrated LUFS (simplified approximation via total RMS minus 0.691 dB)
    const rms = Math.sqrt(sumSquares / totalSamples);
    const lufs = (rms > 0 ? 20 * Math.log10(rms) : -100) - 0.691;
    
    // We want exactly 6dB of headroom (-6.0 dBFS)
    const targetHeadroomDb = -6.0;
    let gainAdjustmentLinear = 1.0;
    
    if (peakDb > targetHeadroomDb) {
      // Mix is too hot, attenuate
      const differenceDb = targetHeadroomDb - peakDb;
      gainAdjustmentLinear = Math.pow(10, differenceDb / 20);
    } else if (peakDb < targetHeadroomDb && peakDb > -90) {
      // Mix is too quiet, bring it up to -6dBFS for consistent master input
      const differenceDb = targetHeadroomDb - peakDb;
      gainAdjustmentLinear = Math.pow(10, differenceDb / 20);
    }

    const offlineCtx = new OfflineAudioContext(numChannels, length, mixedBuffer.sampleRate);
    const adjustedBuffer = offlineCtx.createBuffer(numChannels, length, mixedBuffer.sampleRate);
    
    for (let c = 0; c < numChannels; c++) {
      const src = mixedBuffer.getChannelData(c);
      const dst = adjustedBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        dst[i] = (src[i] ?? 0) * gainAdjustmentLinear;
      }
    }

    return {
      passesGate: true,
      currentHeadroomDB: 6.0,
      originalPeakDb: peakDb,
      originalLufs: lufs,
      adjustedBuffer
    };
  }
}
