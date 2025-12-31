/**
 * Perceptual Diff Test Harness
 *
 * CALIBRATION LAYER - OBSERVATION ONLY
 *
 * Does NOT:
 * - Block processing
 * - Enforce verdicts
 * - Auto-revert changes
 * - Alter control flow
 *
 * Does:
 * - Log perceptual diffs to console
 * - Surface "no change" explicitly
 * - Allow human judgment validation
 */

import { AudioMetrics } from '../types';
import {
  analyzePerceptualDiff,
  assessProcessingVerdict,
  formatPerceptualDiff,
  PerceptualDelta
} from './perceptualDiff';

interface PerceptualDiffSession {
  id: string;
  beforeMetrics: AudioMetrics | null;
  afterMetrics: AudioMetrics | null;
  startTime: number;
}

class PerceptualDiffHarness {
  private sessions: Map<string, PerceptualDiffSession> = new Map();
  private enabled: boolean = true;

  /**
   * Start observing a processing session
   */
  startSession(sessionId: string, beforeMetrics: AudioMetrics): void {
    if (!this.enabled) return;

    this.sessions.set(sessionId, {
      id: sessionId,
      beforeMetrics,
      afterMetrics: null,
      startTime: performance.now()
    });

    console.log(`[Perceptual Diff Harness] Session started: ${sessionId}`);
  }

  /**
   * Complete session and analyze diff
   */
  endSession(sessionId: string, afterMetrics: AudioMetrics): void {
    if (!this.enabled) return;

    const session = this.sessions.get(sessionId);
    if (!session || !session.beforeMetrics) {
      console.warn(`[Perceptual Diff Harness] No session found: ${sessionId}`);
      return;
    }

    session.afterMetrics = afterMetrics;
    const elapsed = performance.now() - session.startTime;

    // Run perceptual diff analysis
    const deltas = analyzePerceptualDiff(session.beforeMetrics, afterMetrics);
    const verdict = assessProcessingVerdict(deltas);

    // Log results
    this.logResults(sessionId, deltas, verdict, elapsed);

    // Cleanup
    this.sessions.delete(sessionId);
  }

  /**
   * Log formatted results to console
   */
  private logResults(
    sessionId: string,
    deltas: PerceptualDelta[],
    verdict: ReturnType<typeof assessProcessingVerdict>,
    elapsed: number
  ): void {
    console.log('\n' + '='.repeat(80));
    console.log(`[Perceptual Diff Harness] Session: ${sessionId}`);
    console.log(`[Perceptual Diff Harness] Elapsed: ${elapsed.toFixed(0)}ms`);
    console.log('='.repeat(80));

    // Primary output: formatted diff
    if (deltas.length === 0) {
      console.log('✓ NO MEANINGFUL PERCEPTUAL CHANGE');
      console.log('  Audio preserved as-is. Silence is success.');
    } else {
      console.log(formatPerceptualDiff(deltas));
    }

    console.log('');

    // Verdict (observation only - NOT enforced)
    console.log(`[Verdict] ${verdict.verdict.toUpperCase()}`);
    console.log(`[Reasoning] ${verdict.reasoning}`);
    console.log(`[Recommendation] ${verdict.recommendation.toUpperCase()} (not enforced)`);

    // Explicit reminder this is observation only
    console.log('');
    console.log('[NOTE] This is OBSERVATION ONLY. No enforcement active.');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Cancel a session without analysis
   */
  cancelSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      console.log(`[Perceptual Diff Harness] Session cancelled: ${sessionId}`);
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Enable/disable harness
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[Perceptual Diff Harness] ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get current status
   */
  getStatus(): { enabled: boolean; activeSessions: number } {
    return {
      enabled: this.enabled,
      activeSessions: this.sessions.size
    };
  }
}

// Singleton instance
export const perceptualDiffHarness = new PerceptualDiffHarness();

/**
 * Convenience wrapper for simple before/after testing
 */
export function testPerceptualDiff(
  before: AudioMetrics,
  after: AudioMetrics,
  label: string = 'test'
): void {
  const sessionId = `${label}-${Date.now()}`;
  perceptualDiffHarness.startSession(sessionId, before);
  perceptualDiffHarness.endSession(sessionId, after);
}
