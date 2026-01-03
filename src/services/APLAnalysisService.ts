/**
 * APL ANALYSIS SERVICE
 * Orchestrates end-to-end analysis: File → Audio Decode → Spectral Analysis → Signal Intelligence → Proposals
 *
 * This is the real entry point for smart proposal generation.
 * Previously we used mock data; now we generate based on actual audio forensics.
 */

import { SpectralAnalyzer } from './dsp/SpectralAnalyzer';
import {
  APLSignalIntelligence,
  APLSignalMetrics,
  APLAnomaly,
  createSignalIntelligence
} from '../echo-sound-lab/apl/signal-intelligence';
import { APLProposal, APLProposalEngine, getAPLProposalEngine } from '../echo-sound-lab/apl/proposal-engine';

export interface AnalysisRequest {
  file: File;
  trackId?: string;
  trackName?: string;
  sessionId?: string;
}

export interface AnalysisResult {
  success: boolean;
  proposals: APLProposal[];
  signalIntelligence?: APLSignalIntelligence;
  error?: string;
}

/**
 * APL Analysis Service
 */
export class APLAnalysisService {
  /**
   * Main entry point: Analyze a file and generate proposals
   */
  public static async analyzeFile(request: AnalysisRequest): Promise<AnalysisResult> {
    try {
      // 1. Decode audio file to AudioBuffer
      const audioBuffer = await this.decodeAudioFile(request.file);

      // 2. Run spectral analysis
      const spectralProfile = SpectralAnalyzer.analyze(audioBuffer);

      // 3. Build signal metrics
      const metrics = this.buildSignalMetrics(spectralProfile);

      // 4. Detect anomalies
      const anomalies = this.detectAnomalies(spectralProfile, metrics);

      // 5. Create signal intelligence
      const trackId = request.trackId || `track_${Date.now()}`;
      const trackName = request.trackName || request.file.name.replace(/\.[^/.]+$/, '');
      const sessionId = request.sessionId || `session_${Date.now()}`;

      const signalIntelligence = createSignalIntelligence({
        trackId,
        trackName,
        sessionId,
        metrics,
        anomalies
      });

      // 6. Generate proposals
      const engine = getAPLProposalEngine();
      const proposals = engine.generateProposals(signalIntelligence);

      return {
        success: true,
        proposals,
        signalIntelligence
      };
    } catch (error) {
      console.error('[APLAnalysisService] Analysis failed:', error);
      return {
        success: false,
        proposals: [],
        error: error instanceof Error ? error.message : 'Unknown analysis error'
      };
    }
  }

  /**
   * Decode audio file to AudioBuffer
   */
  private static async decodeAudioFile(file: File): Promise<AudioBuffer> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  }

  /**
   * Build APLSignalMetrics from SpectralProfile
   */
  private static buildSignalMetrics(profile: any): APLSignalMetrics {
    return {
      loudnessLUFS: profile.loudnessLUFS,
      loudnessRange: 0, // Not computed yet
      truePeakDB: profile.truePeakDB,
      peakLevel: profile.peakLevel,
      crestFactor: profile.crestFactor,
      spectralCentroid: profile.spectralCentroid,
      spectralSpread: 0, // Not computed yet
      clippingDetected: profile.clippingDetected,
      dcOffsetDetected: profile.dcOffsetDetected,
      silenceDetected: profile.silenceDetected,
      duration: profile.duration,
      sampleRate: profile.sampleRate,
      bitDepth: 24 // Default assumption
    };
  }

  /**
   * Detect anomalies from spectral data
   */
  private static detectAnomalies(profile: any, metrics: APLSignalMetrics): APLAnomaly[] {
    const anomalies: APLAnomaly[] = [];

    // CLIPPING DETECTION
    if (profile.clippingDetected) {
      anomalies.push({
        type: 'CLIPPING',
        severity: 'CRITICAL',
        startMs: 0,
        endMs: profile.duration,
        description: `True peak detected at ${profile.truePeakDB.toFixed(1)} dBFS (${profile.clippingEvents} clipped samples). Digital clipping will cause distortion and platform rejection.`,
        suggestedFix: 'Apply limiting or reduce gain before clipping point'
      });
    }

    // DC OFFSET DETECTION
    if (profile.dcOffsetDetected) {
      anomalies.push({
        type: 'DC_OFFSET',
        severity: 'INFO',
        startMs: 0,
        endMs: profile.duration,
        description: `DC offset detected (${Math.abs(profile.dcOffset).toFixed(4)}V). This can cause artifacts in processing chains.`,
        suggestedFix: 'Apply highpass filter at 20Hz to remove DC component'
      });
    }

    // LOUDNESS OUT OF RANGE
    const targetLUFS = -14;
    if (Math.abs(metrics.loudnessLUFS - targetLUFS) > 2.0) {
      const severity = metrics.loudnessLUFS < -20 ? 'WARNING' : 'INFO';
      anomalies.push({
        type: 'LOUDNESS_OUT_OF_RANGE',
        severity,
        startMs: 0,
        endMs: profile.duration,
        description: `Loudness is ${metrics.loudnessLUFS.toFixed(1)} LUFS (target: ${targetLUFS} LUFS for streaming). ${
          metrics.loudnessLUFS < targetLUFS ? 'Too quiet' : 'Too loud'
        } for streaming platforms.`,
        suggestedFix: metrics.loudnessLUFS < targetLUFS ? 'Increase gain' : 'Apply limiting'
      });
    }

    // LOW-END RUMBLE
    if (profile.hasLowEndRumble && profile.lowEndEnergy > 0.3) {
      anomalies.push({
        type: 'SPECTRAL_SKEW',
        severity: 'INFO',
        startMs: 0,
        endMs: profile.duration,
        description: `Excessive low-frequency energy detected (${(profile.lowEndEnergy * 100).toFixed(1)}% of spectrum below 80Hz). May indicate rumble or mic noise.`,
        suggestedFix: 'Apply highpass filter around 80Hz'
      });
    }

    // SILENCE
    if (profile.silenceDetected) {
      anomalies.push({
        type: 'SILENCE',
        severity: 'INFO',
        startMs: 0,
        endMs: profile.duration,
        description: 'File is mostly silence. No processing recommendations.',
        suggestedFix: 'Check if file uploaded correctly'
      });
    }

    return anomalies;
  }
}

/**
 * Convenience singleton
 */
export const aplAnalysisService = new APLAnalysisService();
