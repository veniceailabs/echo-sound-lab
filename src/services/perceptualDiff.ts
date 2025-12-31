/**
 * Perceptual Diff Engine
 *
 * Translates metric deltas into human judgment language.
 * Does not suggest. Does not optimize. Only observes and names change.
 *
 * Core principle: If nothing meaningful changed, return empty array.
 * Silence is a valid outcome.
 */

import { AudioMetrics } from '../types';

export type PerceptualDomain = 'loudness' | 'dynamics' | 'tonality' | 'stereo' | 'transient';
export type Severity = 'negligible' | 'minor' | 'major' | 'critical';

export interface PerceptualDelta {
  domain: PerceptualDomain;
  before: number;
  after: number;
  delta: number;
  severity: Severity;
  meaning: string; // Human language, no metrics
}

/**
 * Severity thresholds (perceptual impact boundaries)
 *
 * These are based on professional listening tests, not taste.
 * Numbers represent "just noticeable difference" and beyond.
 */
const SEVERITY_THRESHOLDS = {
  loudness: {
    // LUFS delta thresholds
    minor: 1.5,    // Noticeable level change
    major: 3.0,    // Significant loudness shift
    critical: 6.0, // Massive loudness change (streaming normalization territory)
  },

  dynamics: {
    // Crest factor (dB) delta thresholds
    minor: 1.0,    // Slight compression noticeable
    major: 3.0,    // Groove/punch affected
    critical: 5.0, // Dynamics destroyed
  },

  tonality: {
    // Spectral balance (percentage) delta thresholds
    minor: 0.10,   // 10% energy shift (just noticeable)
    major: 0.25,   // 25% energy shift (tonal character changed)
    critical: 0.40,// 40% energy shift (fundamental alteration)
  },

  // High-frequency bands need tighter thresholds (more sensitive to HF loss)
  tonalityHighFreq: {
    minor: 0.05,   // 5% HF loss = noticeable dullness
    major: 0.15,   // 15% HF loss = significant crispness reduction
    critical: 0.30,// 30% HF loss = muffled/dull
  },

  transient: {
    // Spectral centroid (Hz) delta thresholds
    // Decrease in centroid = duller, less crisp sound
    minor: 200,    // 200Hz shift noticeable
    major: 500,    // 500Hz shift = significant tonal change
    critical: 1000,// 1000Hz shift = major character change
  },

  peak: {
    // Peak level (dB) delta thresholds
    minor: 0.5,    // Slight headroom change
    major: 1.5,    // Significant peak reduction
    critical: 3.0, // Extreme peak limiting
  }
};

/**
 * Assess severity of a change
 */
function assessSeverity(
  delta: number,
  thresholds: { minor: number; major: number; critical: number }
): Severity {
  const absDelta = Math.abs(delta);

  if (absDelta >= thresholds.critical) return 'critical';
  if (absDelta >= thresholds.major) return 'major';
  if (absDelta >= thresholds.minor) return 'minor';
  return 'negligible';
}

/**
 * Generate human-readable meaning for loudness change
 */
function describeLoudnessChange(delta: number, severity: Severity): string {
  if (severity === 'negligible') return '';

  const direction = delta > 0 ? 'increased' : 'decreased';
  const magnitude = Math.abs(delta).toFixed(1);

  if (severity === 'critical') {
    return delta > 0
      ? `Loudness increased drastically (+${magnitude} LUFS); likely to be reduced by streaming platforms.`
      : `Loudness reduced drastically (${magnitude} LUFS); track will sound quiet compared to commercial releases.`;
  }

  if (severity === 'major') {
    return delta > 0
      ? `Loudness ${direction} significantly (+${magnitude} LUFS); noticeable volume boost.`
      : `Loudness ${direction} significantly (${magnitude} LUFS); noticeable volume reduction.`;
  }

  // minor
  return `Loudness ${direction} slightly (${delta > 0 ? '+' : ''}${magnitude} LUFS).`;
}

/**
 * Generate human-readable meaning for dynamics change
 */
function describeDynamicsChange(delta: number, severity: Severity): string {
  if (severity === 'negligible') return '';

  if (severity === 'critical') {
    return delta < 0
      ? `Dynamic range collapsed (${Math.abs(delta).toFixed(1)} dB lost); groove, punch, and transients likely destroyed.`
      : `Dynamic range expanded unusually (+${delta.toFixed(1)} dB); may indicate processing error or source issue.`;
  }

  if (severity === 'major') {
    return delta < 0
      ? `Dynamic range reduced significantly (${Math.abs(delta).toFixed(1)} dB lost); groove and punch likely flattened.`
      : `Dynamic range increased (+${delta.toFixed(1)} dB); mix may sound unbalanced or under-processed.`;
  }

  // minor
  return delta < 0
    ? `Dynamic range slightly reduced (${Math.abs(delta).toFixed(1)} dB); subtle compression applied.`
    : `Dynamic range slightly increased (+${delta.toFixed(1)} dB).`;
}

/**
 * Generate human-readable meaning for tonal change
 */
function describeTonalChange(
  band: string,
  delta: number,
  severity: Severity
): string {
  if (severity === 'negligible') return '';

  const bandDescriptions: Record<string, { name: string; impact: string }> = {
    low: { name: 'Low-end', impact: 'weight and power' },
    lowMid: { name: 'Low-mid', impact: 'body and warmth' },
    mid: { name: 'Midrange', impact: 'presence and clarity' },
    highMid: { name: 'High-mid', impact: 'definition and intelligibility' },
    high: { name: 'High-end', impact: 'air and brightness' },
  };

  const { name, impact } = bandDescriptions[band] || { name: band, impact: 'tonal character' };
  const percentChange = (delta * 100).toFixed(0);
  const direction = delta > 0 ? 'increased' : 'reduced';

  if (severity === 'critical') {
    return delta < 0
      ? `${name} energy drastically reduced (${percentChange}%); ${impact} likely lost.`
      : `${name} energy drastically increased (+${percentChange}%); tonal imbalance likely.`;
  }

  if (severity === 'major') {
    return delta < 0
      ? `${name} energy reduced significantly (${percentChange}%); ${impact} diminished.`
      : `${name} energy increased significantly (+${percentChange}%); may cause tonal imbalance.`;
  }

  // minor
  return `${name} energy ${direction} slightly (${delta > 0 ? '+' : ''}${percentChange}%).`;
}

/**
 * Generate human-readable meaning for peak change
 */
function describePeakChange(delta: number, severity: Severity): string {
  if (severity === 'negligible') return '';

  if (severity === 'critical') {
    return delta < 0
      ? `Peak level reduced drastically (${Math.abs(delta).toFixed(1)} dB); transient impact severely diminished.`
      : `Peak level increased drastically (+${delta.toFixed(1)} dB); clipping risk introduced.`;
  }

  if (severity === 'major') {
    return delta < 0
      ? `Peak level reduced significantly (${Math.abs(delta).toFixed(1)} dB); transients softened noticeably.`
      : `Peak level increased significantly (+${delta.toFixed(1)} dB); headroom reduced, clipping possible.`;
  }

  // minor
  return delta < 0
    ? `Peak level slightly reduced (${Math.abs(delta).toFixed(1)} dB); gentle transient control.`
    : `Peak level slightly increased (+${delta.toFixed(1)} dB).`;
}

/**
 * Generate human-readable meaning for transient/crispness change
 */
function describeTransientChange(delta: number, severity: Severity): string {
  if (severity === 'negligible') return '';

  // Spectral centroid decrease = duller, less crisp sound
  if (severity === 'critical') {
    return delta < 0
      ? `Transient clarity severely degraded (spectral shift: ${Math.abs(delta).toFixed(0)}Hz); crispness and attack lost.`
      : `Brightness significantly increased (+${delta.toFixed(0)}Hz); may sound harsh or thin.`;
  }

  if (severity === 'major') {
    return delta < 0
      ? `Crispness noticeably reduced (spectral shift: ${Math.abs(delta).toFixed(0)}Hz); transient detail diminished.`
      : `Brightness increased noticeably (+${delta.toFixed(0)}Hz); tonal balance may shift.`;
  }

  // minor
  return delta < 0
    ? `Slight reduction in high-frequency detail (${Math.abs(delta).toFixed(0)}Hz).`
    : `Slight increase in brightness (+${delta.toFixed(0)}Hz).`;
}

/**
 * Analyze perceptual difference between before and after metrics
 *
 * Returns only meaningful changes (severity >= minor).
 * Empty array = no perceptible change = success.
 */
export function analyzePerceptualDiff(
  before: AudioMetrics,
  after: AudioMetrics
): PerceptualDelta[] {
  const deltas: PerceptualDelta[] = [];

  // 1. Loudness (LUFS)
  const lufsDelta = after.lufs - before.lufs;
  const lufsSeverity = assessSeverity(lufsDelta, SEVERITY_THRESHOLDS.loudness);

  if (lufsSeverity !== 'negligible') {
    deltas.push({
      domain: 'loudness',
      before: before.lufs,
      after: after.lufs,
      delta: lufsDelta,
      severity: lufsSeverity,
      meaning: describeLoudnessChange(lufsDelta, lufsSeverity),
    });
  }

  // 2. Dynamics (crest factor)
  const dynamicsDelta = after.crestFactor - before.crestFactor;
  const dynamicsSeverity = assessSeverity(dynamicsDelta, SEVERITY_THRESHOLDS.dynamics);

  if (dynamicsSeverity !== 'negligible') {
    deltas.push({
      domain: 'dynamics',
      before: before.crestFactor,
      after: after.crestFactor,
      delta: dynamicsDelta,
      severity: dynamicsSeverity,
      meaning: describeDynamicsChange(dynamicsDelta, dynamicsSeverity),
    });
  }

  // 3. Peak headroom
  const peakDelta = after.peak - before.peak;
  const peakSeverity = assessSeverity(peakDelta, SEVERITY_THRESHOLDS.peak);

  if (peakSeverity !== 'negligible') {
    deltas.push({
      domain: 'dynamics',
      before: before.peak,
      after: after.peak,
      delta: peakDelta,
      severity: peakSeverity,
      meaning: describePeakChange(peakDelta, peakSeverity),
    });
  }

  // 4. Tonality (spectral balance)
  if (before.spectralBalance && after.spectralBalance) {
    const bands = ['low', 'lowMid', 'mid', 'highMid', 'high'] as const;

    for (const band of bands) {
      const beforeEnergy = before.spectralBalance[band];
      const afterEnergy = after.spectralBalance[band];
      const tonalDelta = afterEnergy - beforeEnergy;

      // Use tighter thresholds for high-frequency bands (more sensitive to HF loss)
      const isHighFreq = band === 'highMid' || band === 'high';
      const thresholds = isHighFreq ? SEVERITY_THRESHOLDS.tonalityHighFreq : SEVERITY_THRESHOLDS.tonality;
      const tonalSeverity = assessSeverity(tonalDelta, thresholds);

      if (tonalSeverity !== 'negligible') {
        deltas.push({
          domain: 'tonality',
          before: beforeEnergy,
          after: afterEnergy,
          delta: tonalDelta,
          severity: tonalSeverity,
          meaning: describeTonalChange(band, tonalDelta, tonalSeverity),
        });
      }
    }
  }

  // 5. Transient clarity (spectral centroid)
  // Decrease in centroid = duller, less crisp sound
  const centroidDelta = after.spectralCentroid - before.spectralCentroid;
  const centroidSeverity = assessSeverity(centroidDelta, SEVERITY_THRESHOLDS.transient);

  if (centroidSeverity !== 'negligible') {
    deltas.push({
      domain: 'transient',
      before: before.spectralCentroid,
      after: after.spectralCentroid,
      delta: centroidDelta,
      severity: centroidSeverity,
      meaning: describeTransientChange(centroidDelta, centroidSeverity),
    });
  }

  return deltas;
}

/**
 * Assess overall verdict: did processing help or hurt?
 *
 * This is the veto function. It can reject processing outright.
 */
export function assessProcessingVerdict(deltas: PerceptualDelta[]): {
  verdict: 'improvement' | 'regression' | 'neutral' | 'no_change';
  reasoning: string;
  recommendation: 'accept' | 'reject' | 'warn';
} {
  // No meaningful change = success (preservation)
  if (deltas.length === 0) {
    return {
      verdict: 'no_change',
      reasoning: 'No perceptible changes detected. Audio preserved as-is.',
      recommendation: 'accept',
    };
  }

  // Count critical/major regressions
  const criticalRegressions = deltas.filter(
    d => d.severity === 'critical' && (
      (d.domain === 'dynamics' && d.delta < 0) || // Lost dynamics
      (d.domain === 'tonality' && d.delta < -0.25) || // Lost tonal balance
      (d.domain === 'loudness' && d.delta < -6) // Massive loudness loss
    )
  );

  // Any critical regression = hard reject
  if (criticalRegressions.length > 0) {
    return {
      verdict: 'regression',
      reasoning: `Critical issues detected: ${criticalRegressions.map(d => d.meaning).join(' ')}`,
      recommendation: 'reject',
    };
  }

  // Count major regressions
  const majorRegressions = deltas.filter(
    d => d.severity === 'major' && (
      (d.domain === 'dynamics' && d.delta < -2) ||
      (d.domain === 'tonality' && d.delta < -0.15)
    )
  );

  // Multiple major regressions = reject
  if (majorRegressions.length >= 2) {
    return {
      verdict: 'regression',
      reasoning: `Multiple major issues: ${majorRegressions.map(d => d.meaning).join(' ')}`,
      recommendation: 'reject',
    };
  }

  // Single major regression = warn
  if (majorRegressions.length === 1) {
    return {
      verdict: 'regression',
      reasoning: majorRegressions[0].meaning,
      recommendation: 'warn',
    };
  }

  // Only minor changes = neutral or improvement
  const hasImprovements = deltas.some(
    d => (d.domain === 'loudness' && d.delta > 0 && d.delta < 3) || // Reasonable loudness gain
         (d.domain === 'dynamics' && d.delta > 0) // Improved dynamics
  );

  if (hasImprovements) {
    return {
      verdict: 'improvement',
      reasoning: `Minor improvements: ${deltas.map(d => d.meaning).join(' ')}`,
      recommendation: 'accept',
    };
  }

  return {
    verdict: 'neutral',
    reasoning: `Minor changes detected: ${deltas.map(d => d.meaning).join(' ')}`,
    recommendation: 'accept',
  };
}

/**
 * Format deltas for console logging
 */
export function formatPerceptualDiff(deltas: PerceptualDelta[]): string {
  if (deltas.length === 0) {
    return '[Perceptual Diff] No meaningful changes detected.';
  }

  const lines = ['[Perceptual Diff] Changes detected:'];

  for (const delta of deltas) {
    const severity = delta.severity.toUpperCase().padEnd(10);
    const domain = delta.domain.padEnd(10);
    lines.push(`  ${severity} ${domain} ${delta.meaning}`);
  }

  return lines.join('\n');
}
