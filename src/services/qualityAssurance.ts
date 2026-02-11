/**
 * QUALITY ASSURANCE LAYER
 *
 * Integrates Perceptual Diff to actually enforce audio quality standards.
 * Warns/blocks when processing causes regression (not just observes).
 */

import { AudioMetrics } from '../types';
import { analyzePerceptualDiff, assessProcessingVerdict } from './perceptualDiff';

export interface QualityVerdictInfo {
  verdict: 'pass' | 'warn' | 'fail';
  uiVerdict: 'accept' | 'warn' | 'block';
  severity: 'none' | 'warning' | 'critical';
  issues: string[];
  recommendation: string;
  shouldBlock: boolean; // If true, warn user before applying
}

export class QualityAssurance {
  /**
   * Assess quality of processing before applying to final output
   */
  assessProcessingQuality(
    beforeMetrics: AudioMetrics,
    afterMetrics: AudioMetrics
  ): QualityVerdictInfo {
    // Analyze perceptual differences
    const deltasArray = analyzePerceptualDiff(beforeMetrics, afterMetrics);
    const verdict = assessProcessingVerdict(deltasArray);

    const issues: string[] = [];
    const issueSet = new Set<string>();
    let shouldBlock = false;

    // Extract actionable verdicts from the perceptual delta array
    deltasArray.forEach(delta => {
      if (delta.domain === 'loudness') {
        if (delta.delta < -3) {
          const issue = `⚠️ Loudness dropped ${Math.abs(delta.delta).toFixed(1)}dB (may sound quiet on streaming)`;
          if (!issueSet.has(issue)) {
            issues.push(issue);
            issueSet.add(issue);
          }
          shouldBlock = delta.delta < -5;
        }
      }

      if (delta.domain === 'dynamics') {
        // Differentiate peak deltas vs crest-factor deltas
        const isPeakDelta = delta.meaning?.startsWith('Peak level');
        if (isPeakDelta) {
          const peakChange = delta.delta;
          if (peakChange < -6) {
            const issue = `⚠️ Peak level lowered significantly (may be over-compressed)`;
            if (!issueSet.has(issue)) {
              issues.push(issue);
              issueSet.add(issue);
            }
            shouldBlock = true;
          }
          if (peakChange > 0) {
            const issue = `⚠️ Peak increased (clipping risk)`;
            if (!issueSet.has(issue)) {
              issues.push(issue);
              issueSet.add(issue);
            }
            const clippingRisk = afterMetrics.peak > -0.3 || peakChange > 2.5;
            if (clippingRisk) {
              shouldBlock = true;
            }
          }
        } else {
          const crestChange = delta.delta;
          if (crestChange < -3) {
            const issue = `⚠️ Dynamics reduced significantly (may sound squished)`;
            if (!issueSet.has(issue)) {
              issues.push(issue);
              issueSet.add(issue);
            }
            shouldBlock = crestChange < -5;
          }
          if (crestChange > 5) {
            const issue = `⚠️ Dynamics increased too much (may sound uncontrolled)`;
            if (!issueSet.has(issue)) {
              issues.push(issue);
              issueSet.add(issue);
            }
            shouldBlock = true;
          }
        }
      }

      if (delta.domain === 'tonality') {
        // Add tonality change info if meaningful
        if (delta.meaning && delta.severity !== 'negligible') {
          const issue = `⚠️ ${delta.meaning}`;
          if (!issueSet.has(issue)) {
            issues.push(issue);
            issueSet.add(issue);
          }
        }
      }
    });

    const uniqueIssues = Array.from(new Set(issues));

    // Determine severity
    let severity: 'none' | 'warning' | 'critical' = 'none';
    if (uniqueIssues.length > 0) severity = 'warning';
    if (shouldBlock) severity = 'critical';

    return {
      verdict: shouldBlock ? 'fail' : verdict.verdict === 'pass' ? 'pass' : 'warn',
      uiVerdict: shouldBlock ? 'block' : verdict.verdict === 'pass' ? 'accept' : 'warn',
      severity,
      issues: uniqueIssues,
      recommendation: shouldBlock ? 'REVIEW' : verdict.recommendation.toUpperCase(),
      shouldBlock,
    };
  }

  /**
   * Check if processing creates audible artifacts
   */
  detectArtifacts(afterMetrics: AudioMetrics): string[] {
    const artifacts: string[] = [];

    // Check for clipping
    if (afterMetrics.peak > -0.1) {
      artifacts.push('Possible clipping detected (peak too close to 0dBFS)');
    }

    // Check for over-compression
    const crestFactor = afterMetrics.peak - afterMetrics.rms;
    if (crestFactor < 3) {
      artifacts.push('Over-compression detected (very flat dynamics)');
    }

    // Check for phase weirdness
    // (This would need actual phase analysis - placeholder for now)

    return artifacts;
  }

  /**
   * Generate user-friendly quality report
   */
  generateQualityReport(verdict: QualityVerdictInfo): string {
    const lines: string[] = [];

    lines.push('📊 QUALITY ASSESSMENT');
    lines.push('='.repeat(40));

    if (verdict.severity === 'none') {
      lines.push('✅ No issues detected');
    } else if (verdict.severity === 'warning') {
      lines.push('⚠️  WARNINGS FOUND:');
      verdict.issues.forEach(issue => lines.push(`  ${issue}`));
    } else {
      lines.push('🚫 CRITICAL ISSUES:');
      verdict.issues.forEach(issue => lines.push(`  ${issue}`));
    }

    lines.push('');
    lines.push(`📝 Recommendation: ${verdict.recommendation}`);

    return lines.join('\n');
  }
}

export const qualityAssurance = new QualityAssurance();
