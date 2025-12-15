/**
 * Reference Track Analyzer V2
 * Advanced analysis to detect reverb, delay, vocal positioning, and sidechain patterns
 */

import { mixAnalysisService } from './mixAnalysis';

export interface ReverbAnalysis {
  detected: boolean;
  decayTime: number; // seconds
  preDelay: number; // ms
  wetDryRatio: number; // 0-1
  character: 'room' | 'hall' | 'plate' | 'spring' | 'ambient' | 'unknown';
  brightness: 'dark' | 'neutral' | 'bright';
  density: number; // 0-1
}

export interface DelayAnalysis {
  detected: boolean;
  delayTimeMs: number;
  delayTimeBPM: number | null; // if tempo-synced
  feedback: number; // 0-1
  wetDryRatio: number;
  stereoSpread: number; // 0-1, 0 = mono, 1 = ping-pong
  type: 'slapback' | 'quarter' | 'eighth' | 'dotted' | 'triplet' | 'long' | 'unknown';
}

export interface VocalPositionAnalysis {
  detected: boolean;
  forwardness: number; // 0-1, how upfront the vocal is
  wetDryRatio: number; // estimated reverb amount on vocal
  wideness: number; // 0-1, stereo spread of vocal
  presenceFreq: number; // Hz where vocal presence peaks
  airAmount: number; // high shelf boost estimate
}

export interface SidechainAnalysis {
  detected: boolean;
  amount: number; // dB of ducking
  attackMs: number;
  releaseMs: number;
  rhythmPattern: 'kick' | 'quarter' | 'eighth' | 'custom';
  pumpFactor: number; // 0-1, how obvious the pumping effect is
}

export interface AdvancedReferenceAnalysis {
  reverb: ReverbAnalysis;
  delay: DelayAnalysis;
  vocalPosition: VocalPositionAnalysis;
  sidechain: SidechainAnalysis;
  estimatedBPM: number;
  overallCharacter: {
    space: 'dry' | 'intimate' | 'medium' | 'spacious' | 'vast';
    energy: 'relaxed' | 'moderate' | 'energetic' | 'aggressive';
    production: 'raw' | 'polished' | 'hyperproduced' | 'lofi';
  };
}

class ReferenceAnalyzerV2 {
  private audioContext: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  /**
   * Full advanced analysis of a reference track
   */
  async analyzeReference(buffer: AudioBuffer): Promise<AdvancedReferenceAnalysis> {
    const [reverb, delay, vocalPosition, sidechain, bpm] = await Promise.all([
      this.analyzeReverb(buffer),
      this.analyzeDelay(buffer),
      this.analyzeVocalPosition(buffer),
      this.analyzeSidechain(buffer),
      this.detectBPM(buffer)
    ]);

    const overallCharacter = this.determineOverallCharacter(reverb, delay, sidechain);

    return {
      reverb,
      delay,
      vocalPosition,
      sidechain,
      estimatedBPM: bpm,
      overallCharacter
    };
  }

  /**
   * Analyze reverb characteristics using autocorrelation and decay envelope
   */
  async analyzeReverb(buffer: AudioBuffer): Promise<ReverbAnalysis> {
    const ctx = this.getContext();
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Look at the tail of transients to estimate reverb decay
    // Find decay time by analyzing envelope after peaks
    const blockSize = 2048;
    const hopSize = 512;
    const numBlocks = Math.floor((channelData.length - blockSize) / hopSize);

    let maxDecayTime = 0;
    let avgWetLevel = 0;
    let peakCount = 0;

    // Analyze multiple sections
    for (let section = 0; section < 5; section++) {
      const startSample = Math.floor((buffer.length / 6) * (section + 1));
      const endSample = Math.min(startSample + sampleRate * 2, buffer.length);

      if (endSample <= startSample) continue;

      // Find peaks and measure decay
      const sectionData = channelData.slice(startSample, endSample);
      const envelope = this.computeEnvelope(sectionData, 256);

      // Find peak and measure RT60-style decay
      let peakIdx = 0;
      let peakVal = 0;
      for (let i = 0; i < envelope.length; i++) {
        if (envelope[i] > peakVal) {
          peakVal = envelope[i];
          peakIdx = i;
        }
      }

      if (peakVal > 0.1) {
        // Measure time to decay to -60dB (or 1/1000th)
        const targetLevel = peakVal * 0.001;
        let decayIdx = peakIdx;
        for (let i = peakIdx; i < envelope.length; i++) {
          if (envelope[i] < targetLevel) {
            decayIdx = i;
            break;
          }
        }

        const decayTime = (decayIdx - peakIdx) * 256 / sampleRate;
        if (decayTime > maxDecayTime) maxDecayTime = decayTime;

        // Estimate wet level from sustained tail
        const tailStart = peakIdx + Math.floor(0.05 * sampleRate / 256);
        const tailEnd = Math.min(tailStart + Math.floor(0.3 * sampleRate / 256), envelope.length);
        let tailSum = 0;
        for (let i = tailStart; i < tailEnd; i++) {
          tailSum += envelope[i];
        }
        avgWetLevel += (tailSum / (tailEnd - tailStart)) / peakVal;
        peakCount++;
      }
    }

    avgWetLevel = peakCount > 0 ? avgWetLevel / peakCount : 0;

    // Determine reverb character based on decay time
    let character: ReverbAnalysis['character'] = 'unknown';
    if (maxDecayTime < 0.3) character = 'room';
    else if (maxDecayTime < 0.8) character = 'plate';
    else if (maxDecayTime < 1.5) character = 'hall';
    else if (maxDecayTime < 3) character = 'hall';
    else character = 'ambient';

    // Analyze brightness by looking at HF content in tail
    const brightness = await this.analyzeReverbBrightness(buffer);

    return {
      detected: maxDecayTime > 0.1 || avgWetLevel > 0.05,
      decayTime: Math.min(maxDecayTime, 5),
      preDelay: this.estimatePreDelay(buffer),
      wetDryRatio: Math.min(avgWetLevel * 2, 1),
      character,
      brightness,
      density: Math.min(avgWetLevel * 3, 1)
    };
  }

  /**
   * Analyze delay characteristics using autocorrelation
   */
  async analyzeDelay(buffer: AudioBuffer): Promise<DelayAnalysis> {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Use autocorrelation to find repeating patterns (delays)
    const blockSize = 8192;
    const correlations: number[] = [];

    // Search for delays between 50ms and 1000ms
    const minLag = Math.floor(0.05 * sampleRate);
    const maxLag = Math.floor(1.0 * sampleRate);

    // Analyze middle section of track
    const startSample = Math.floor(buffer.length * 0.3);
    const section = channelData.slice(startSample, startSample + blockSize * 4);

    for (let lag = minLag; lag < maxLag && lag < section.length / 2; lag += 10) {
      let correlation = 0;
      let count = 0;
      for (let i = 0; i < section.length - lag; i += 4) {
        correlation += section[i] * section[i + lag];
        count++;
      }
      correlations.push({ lag, value: correlation / count } as any);
    }

    // Find peaks in correlation (indicates delay times)
    let bestLag = 0;
    let bestCorr = 0;
    for (const c of correlations as any[]) {
      if (c.value > bestCorr) {
        bestCorr = c.value;
        bestLag = c.lag;
      }
    }

    const delayTimeMs = (bestLag / sampleRate) * 1000;
    const bpm = await this.detectBPM(buffer);

    // Check if delay syncs to tempo
    let delayTimeBPM: number | null = null;
    let type: DelayAnalysis['type'] = 'unknown';

    if (bpm > 0) {
      const quarterNoteMs = 60000 / bpm;
      const eighthNoteMs = quarterNoteMs / 2;
      const dottedEighthMs = eighthNoteMs * 1.5;

      if (Math.abs(delayTimeMs - quarterNoteMs) < 20) {
        delayTimeBPM = bpm;
        type = 'quarter';
      } else if (Math.abs(delayTimeMs - eighthNoteMs) < 15) {
        delayTimeBPM = bpm;
        type = 'eighth';
      } else if (Math.abs(delayTimeMs - dottedEighthMs) < 15) {
        delayTimeBPM = bpm;
        type = 'dotted';
      } else if (delayTimeMs < 80) {
        type = 'slapback';
      } else if (delayTimeMs > 500) {
        type = 'long';
      }
    }

    // Estimate feedback from correlation decay
    const feedbackEstimate = Math.min(bestCorr * 5, 0.8);

    // Check for stereo delay by comparing L/R
    let stereoSpread = 0;
    if (buffer.numberOfChannels >= 2) {
      const leftData = buffer.getChannelData(0);
      const rightData = buffer.getChannelData(1);
      let diffSum = 0;
      const sampleCount = Math.min(10000, buffer.length);
      for (let i = 0; i < sampleCount; i++) {
        diffSum += Math.abs(leftData[i] - rightData[i]);
      }
      stereoSpread = Math.min(diffSum / sampleCount * 10, 1);
    }

    return {
      detected: bestCorr > 0.05 && delayTimeMs > 30,
      delayTimeMs: Math.round(delayTimeMs),
      delayTimeBPM,
      feedback: feedbackEstimate,
      wetDryRatio: Math.min(bestCorr * 3, 0.5),
      stereoSpread,
      type
    };
  }

  /**
   * Analyze vocal positioning in the mix
   */
  async analyzeVocalPosition(buffer: AudioBuffer): Promise<VocalPositionAnalysis> {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Vocal frequency range: 200Hz - 4000Hz
    // Presence: 2000-5000Hz
    // Air: 8000-12000Hz

    // Use FFT to analyze frequency content
    const fftSize = 4096;
    const numAnalysisPoints = 10;
    const analysisResults: { presence: number; air: number; midEnergy: number }[] = [];

    for (let i = 0; i < numAnalysisPoints; i++) {
      const startSample = Math.floor((buffer.length / (numAnalysisPoints + 1)) * (i + 1));
      const section = channelData.slice(startSample, startSample + fftSize);

      if (section.length < fftSize) continue;

      // Simple frequency analysis using zero-crossings and energy in bands
      const vocalBandEnergy = this.measureBandEnergy(section, sampleRate, 200, 4000);
      const presenceEnergy = this.measureBandEnergy(section, sampleRate, 2000, 5000);
      const airEnergy = this.measureBandEnergy(section, sampleRate, 8000, 12000);
      const totalEnergy = this.measureBandEnergy(section, sampleRate, 20, 20000);

      analysisResults.push({
        presence: presenceEnergy / (totalEnergy + 0.001),
        air: airEnergy / (totalEnergy + 0.001),
        midEnergy: vocalBandEnergy / (totalEnergy + 0.001)
      });
    }

    // Average results
    const avgPresence = analysisResults.reduce((a, b) => a + b.presence, 0) / analysisResults.length;
    const avgAir = analysisResults.reduce((a, b) => a + b.air, 0) / analysisResults.length;
    const avgMidEnergy = analysisResults.reduce((a, b) => a + b.midEnergy, 0) / analysisResults.length;

    // Estimate forwardness - higher mid energy = more upfront vocal
    const forwardness = Math.min(avgMidEnergy * 3, 1);

    // Estimate wet/dry from presence clarity vs blur
    const wetDryRatio = 1 - forwardness;

    // Check stereo width of vocal range
    let wideness = 0;
    if (buffer.numberOfChannels >= 2) {
      const leftData = buffer.getChannelData(0);
      const rightData = buffer.getChannelData(1);
      // Sum and difference analysis
      let midEnergy = 0;
      let sideEnergy = 0;
      for (let i = 0; i < Math.min(buffer.length, 50000); i++) {
        const mid = (leftData[i] + rightData[i]) / 2;
        const side = (leftData[i] - rightData[i]) / 2;
        midEnergy += mid * mid;
        sideEnergy += side * side;
      }
      wideness = sideEnergy / (midEnergy + sideEnergy + 0.001);
    }

    return {
      detected: avgMidEnergy > 0.2,
      forwardness,
      wetDryRatio: Math.min(wetDryRatio, 0.7),
      wideness,
      presenceFreq: avgPresence > 0.1 ? 3000 : 2500,
      airAmount: avgAir * 10
    };
  }

  /**
   * Analyze sidechain compression patterns
   */
  async analyzeSidechain(buffer: AudioBuffer): Promise<SidechainAnalysis> {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Detect sidechain by looking for rhythmic amplitude dips
    const envelope = this.computeEnvelope(channelData, 128);
    const bpm = await this.detectBPM(buffer);

    // Expected samples between kicks at detected BPM
    const samplesPerBeat = bpm > 0 ? (60 / bpm) * sampleRate / 128 : 0;

    let duckingAmount = 0;
    let pumpCount = 0;
    let totalDips = 0;

    if (samplesPerBeat > 0) {
      // Look for regular dips in envelope
      for (let i = Math.floor(samplesPerBeat); i < envelope.length - samplesPerBeat; i += Math.floor(samplesPerBeat)) {
        const peakBefore = Math.max(...envelope.slice(Math.max(0, i - 10), i));
        const dipValue = envelope[i];
        const peakAfter = Math.max(...envelope.slice(i, Math.min(envelope.length, i + 10)));

        const avgPeak = (peakBefore + peakAfter) / 2;
        if (avgPeak > 0 && dipValue < avgPeak * 0.7) {
          duckingAmount += (avgPeak - dipValue) / avgPeak;
          pumpCount++;
        }
        totalDips++;
      }
    }

    const detected = pumpCount > totalDips * 0.3 && totalDips > 4;
    const avgDucking = pumpCount > 0 ? duckingAmount / pumpCount : 0;

    // Estimate ducking in dB
    const duckingDb = avgDucking > 0 ? -20 * Math.log10(1 - avgDucking) : 0;

    return {
      detected,
      amount: Math.min(duckingDb, 12),
      attackMs: 5, // typical
      releaseMs: detected ? 150 : 100,
      rhythmPattern: detected ? 'kick' : 'quarter',
      pumpFactor: Math.min(avgDucking * 2, 1)
    };
  }

  /**
   * Detect BPM using onset detection and autocorrelation
   */
  async detectBPM(buffer: AudioBuffer): Promise<number> {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Compute envelope
    const envelope = this.computeEnvelope(channelData, 512);

    // Compute onset strength (derivative of envelope)
    const onsets: number[] = [];
    for (let i = 1; i < envelope.length; i++) {
      onsets.push(Math.max(0, envelope[i] - envelope[i - 1]));
    }

    // Autocorrelation of onset signal to find tempo
    const minBPM = 60;
    const maxBPM = 180;
    const minLag = Math.floor((60 / maxBPM) * sampleRate / 512);
    const maxLag = Math.floor((60 / minBPM) * sampleRate / 512);

    let bestLag = 0;
    let bestCorr = 0;

    for (let lag = minLag; lag < maxLag && lag < onsets.length / 2; lag++) {
      let correlation = 0;
      for (let i = 0; i < onsets.length - lag; i++) {
        correlation += onsets[i] * onsets[i + lag];
      }
      if (correlation > bestCorr) {
        bestCorr = correlation;
        bestLag = lag;
      }
    }

    const bpm = bestLag > 0 ? (60 * sampleRate) / (bestLag * 512) : 120;

    // Snap to common BPM values
    const commonBPMs = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150];
    let closestBPM = 120;
    let minDiff = Infinity;
    for (const common of commonBPMs) {
      const diff = Math.abs(bpm - common);
      if (diff < minDiff) {
        minDiff = diff;
        closestBPM = common;
      }
    }

    return minDiff < 5 ? closestBPM : Math.round(bpm);
  }

  // Helper methods
  private computeEnvelope(data: Float32Array, blockSize: number): number[] {
    const envelope: number[] = [];
    for (let i = 0; i < data.length - blockSize; i += blockSize) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(data[i + j]);
      }
      envelope.push(sum / blockSize);
    }
    return envelope;
  }

  private measureBandEnergy(data: Float32Array, sampleRate: number, lowFreq: number, highFreq: number): number {
    // Simple bandpass energy estimation using zero-crossing rate
    let energy = 0;
    let crossings = 0;
    let prevSign = data[0] >= 0;

    for (let i = 1; i < data.length; i++) {
      const currentSign = data[i] >= 0;
      if (currentSign !== prevSign) crossings++;
      prevSign = currentSign;
      energy += data[i] * data[i];
    }

    // Estimate frequency from zero crossings
    const estFreq = (crossings / 2) * (sampleRate / data.length);

    // Weight energy by how close estimated freq is to target band
    const bandCenter = (lowFreq + highFreq) / 2;
    const freqMatch = 1 - Math.min(Math.abs(estFreq - bandCenter) / bandCenter, 1);

    return energy * freqMatch;
  }

  private estimatePreDelay(buffer: AudioBuffer): number {
    // Pre-delay estimation: time between direct sound and first reflection
    // This is a simplified estimate
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Find a transient and measure gap to sustained tail
    let maxPeak = 0;
    let peakIdx = 0;
    const searchLen = Math.min(buffer.length, sampleRate * 2);

    for (let i = 0; i < searchLen; i++) {
      if (Math.abs(channelData[i]) > maxPeak) {
        maxPeak = Math.abs(channelData[i]);
        peakIdx = i;
      }
    }

    // Look for secondary peak (reverb onset)
    const searchStart = peakIdx + Math.floor(0.01 * sampleRate); // Start 10ms after
    const searchEnd = Math.min(peakIdx + Math.floor(0.1 * sampleRate), searchLen);

    let secondaryPeak = 0;
    let secondaryIdx = searchStart;
    for (let i = searchStart; i < searchEnd; i++) {
      if (Math.abs(channelData[i]) > secondaryPeak && Math.abs(channelData[i]) < maxPeak * 0.5) {
        secondaryPeak = Math.abs(channelData[i]);
        secondaryIdx = i;
      }
    }

    const preDelayMs = ((secondaryIdx - peakIdx) / sampleRate) * 1000;
    return Math.max(0, Math.min(preDelayMs, 100)); // Cap at 100ms
  }

  private async analyzeReverbBrightness(buffer: AudioBuffer): Promise<'dark' | 'neutral' | 'bright'> {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Sample the tail sections and compare HF to LF energy
    const tailStart = Math.floor(buffer.length * 0.7);
    const tailData = channelData.slice(tailStart, tailStart + 10000);

    const lowEnergy = this.measureBandEnergy(tailData, sampleRate, 100, 500);
    const highEnergy = this.measureBandEnergy(tailData, sampleRate, 4000, 10000);

    const ratio = highEnergy / (lowEnergy + 0.001);

    if (ratio > 0.5) return 'bright';
    if (ratio < 0.2) return 'dark';
    return 'neutral';
  }

  private determineOverallCharacter(
    reverb: ReverbAnalysis,
    delay: DelayAnalysis,
    sidechain: SidechainAnalysis
  ): AdvancedReferenceAnalysis['overallCharacter'] {
    // Determine space
    let space: AdvancedReferenceAnalysis['overallCharacter']['space'] = 'medium';
    const totalWet = reverb.wetDryRatio + delay.wetDryRatio;
    if (totalWet < 0.1) space = 'dry';
    else if (totalWet < 0.25) space = 'intimate';
    else if (totalWet < 0.5) space = 'medium';
    else if (totalWet < 0.7) space = 'spacious';
    else space = 'vast';

    // Determine energy
    let energy: AdvancedReferenceAnalysis['overallCharacter']['energy'] = 'moderate';
    if (sidechain.detected && sidechain.pumpFactor > 0.5) energy = 'aggressive';
    else if (sidechain.detected && sidechain.pumpFactor > 0.2) energy = 'energetic';
    else if (reverb.decayTime > 2) energy = 'relaxed';

    // Determine production style
    let production: AdvancedReferenceAnalysis['overallCharacter']['production'] = 'polished';
    if (totalWet < 0.15 && !sidechain.detected) production = 'raw';
    else if (totalWet > 0.5 || (sidechain.detected && delay.detected)) production = 'hyperproduced';

    return { space, energy, production };
  }
}

export const referenceAnalyzerV2 = new ReferenceAnalyzerV2();