/**
 * Audio Processing Layer: Signal Intelligence (APL-SIG-INT)
 *
 * Forensic metric extraction from audio signals.
 * Objective technical truth that feeds into Authority Layer proposals.
 *
 * These metrics are:
 *  ✅ Objective (measurable, reproducible)
 *  ✅ Forensic (provable, auditable)
 *  ✅ Non-subjective (unlike tone/mix quality assessment)
 *
 * They belong in the Audit Log alongside the human decision.
 */

/**
 * Signal Intelligence Metrics
 * Extracted forensic data from audio analysis
 */
export interface APLSignalMetrics {
  // Loudness (ITU-R BS.1770-4 standard)
  loudnessLUFS: number;         // Integrated loudness in LUFS (e.g., -16, -23)
  loudnessRange: number;        // LU (loudness range in the track)

  // Peaks & Dynamics
  truePeakDB: number;           // True peak level (dBFS)
  peakLevel: number;            // Simple peak (RMS-based)
  crestFactor: number;          // Peak-to-RMS ratio (dynamics indicator)

  // Frequency Content
  spectralCentroid: number;     // "Brightness" center frequency (Hz)
  spectralSpread: number;       // Frequency bandwidth distribution

  // Anomalies & Safety
  clippingDetected: boolean;    // Any samples at/above 0dB?
  dcOffsetDetected: boolean;    // DC bias in signal?
  silenceDetected: boolean;     // Long sections of silence?

  // Metadata
  duration: number;             // Track duration (ms)
  sampleRate: number;           // Sample rate (Hz)
  bitDepth: number;             // Bit depth (24, 16, etc.)
}

/**
 * Anomaly Detection
 * Specific issues found during analysis
 */
export interface APLAnomaly {
  type: 'CLIPPING' | 'DC_OFFSET' | 'SILENCE' | 'LOUDNESS_OUT_OF_RANGE' | 'SPECTRAL_SKEW';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  startMs: number;              // Relative to track start
  endMs: number;
  description: string;          // Human-readable explanation
  suggestedFix?: string;        // Proposed remedy (informational only)
}

/**
 * Complete Signal Intelligence Report
 * The output of APL analysis
 */
export interface APLSignalIntelligence {
  // Identifiers
  trackId: string;              // Unique track identifier
  trackName: string;            // Display name
  sessionId: string;            // Audio session reference

  // Timestamp (when was this analysis performed)
  analyzedAt: number;           // Epoch ms

  // The Metrics
  metrics: APLSignalMetrics;

  // The Anomalies
  anomalies: APLAnomaly[];

  // Verdict (summary for HUD display)
  verdict: {
    isReadyForMastering: boolean;
    issues: string[];           // List of issues in plain English
    recommendations: string[];  // Suggested actions
  };

  // Immutability marker (this analysis is sealed)
  immutable: true;
}

/**
 * Helper: Create a signal intelligence report
 */
export function createSignalIntelligence(params: {
  trackId: string;
  trackName: string;
  sessionId: string;
  metrics: APLSignalMetrics;
  anomalies?: APLAnomaly[];
}): APLSignalIntelligence {
  const anomalies = params.anomalies || [];

  // Compute verdict
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check loudness
  if (params.metrics.loudnessLUFS > -13 || params.metrics.loudnessLUFS < -23) {
    issues.push(`Loudness out of streaming range: ${params.metrics.loudnessLUFS.toFixed(1)} LUFS`);
    const targetLUFS = -14;
    const gainAdjust = targetLUFS - params.metrics.loudnessLUFS;
    recommendations.push(`Apply ${gainAdjust > 0 ? '+' : ''}${gainAdjust.toFixed(1)} dB gain to reach -14 LUFS`);
  }

  // Check clipping
  if (params.metrics.clippingDetected) {
    issues.push(`Clipping detected at ${params.metrics.truePeakDB.toFixed(1)} dBFS`);
    recommendations.push(`Apply limiter at -0.1 dBFS to prevent clipping`);
  }

  // Check DC offset
  if (params.metrics.dcOffsetDetected) {
    issues.push('DC offset detected');
    recommendations.push('Apply DC offset removal filter');
  }

  // Check silence
  if (params.metrics.silenceDetected) {
    issues.push('Long silence sections detected');
    recommendations.push('Trim silence or gate quiet sections');
  }

  const isReadyForMastering = issues.length === 0;

  const report: APLSignalIntelligence = {
    trackId: params.trackId,
    trackName: params.trackName,
    sessionId: params.sessionId,
    analyzedAt: Date.now(),
    metrics: params.metrics,
    anomalies,
    verdict: {
      isReadyForMastering,
      issues,
      recommendations,
    },
    immutable: true,
  };

  // Freeze to enforce immutability
  Object.freeze(report);
  Object.freeze(report.metrics);
  Object.freeze(report.verdict);
  Object.freeze(report.anomalies);

  return report;
}

/**
 * Helper: Determine if track needs gain adjustment
 */
export function getGainAdjustmentNeeded(metrics: APLSignalMetrics, targetLUFS: number = -14): number {
  return targetLUFS - metrics.loudnessLUFS;
}

/**
 * Helper: Determine if track needs limiting
 */
export function getLimiterThresholdNeeded(metrics: APLSignalMetrics): number | null {
  if (metrics.clippingDetected) {
    // Set limiter just below the peak to prevent clipping
    return Math.min(metrics.truePeakDB - 0.1, -0.1);
  }
  return null;
}
