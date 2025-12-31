/**
 * Perceptual Diff Harness - Integration Examples
 *
 * Copy-paste these patterns where needed.
 * Remove when calibration complete.
 */

import { perceptualDiffHarness, testPerceptualDiff } from './perceptualDiffHarness';
import { AudioMetrics } from '../types';

// ============================================================================
// EXAMPLE 1: Simple Before/After Test
// ============================================================================

export function exampleSimpleTest(beforeMetrics: AudioMetrics, afterMetrics: AudioMetrics) {
  testPerceptualDiff(beforeMetrics, afterMetrics, 'simple-test');
}

// ============================================================================
// EXAMPLE 2: Session-Based (for async processing)
// ============================================================================

export function exampleSessionBased(beforeMetrics: AudioMetrics) {
  const sessionId = 'mastering-pass-1';

  // Start observation
  perceptualDiffHarness.startSession(sessionId, beforeMetrics);

  // ... processing happens here ...

  // Later, when processing completes:
  // perceptualDiffHarness.endSession(sessionId, afterMetrics);
}

// ============================================================================
// EXAMPLE 3: Integration Point in Audio Engine
// ============================================================================

/*
// In src/services/audioEngine.ts or similar:

async function processAudio(audioBuffer: AudioBuffer) {
  // 1. Capture BEFORE metrics
  const beforeMetrics = await analyzeAudioMetrics(audioBuffer);

  // 2. Start harness observation
  perceptualDiffHarness.startSession('audio-engine', beforeMetrics);

  // 3. Apply processing (unchanged)
  const processedBuffer = await applyProcessingChain(audioBuffer);

  // 4. Capture AFTER metrics
  const afterMetrics = await analyzeAudioMetrics(processedBuffer);

  // 5. End harness observation (logs to console)
  perceptualDiffHarness.endSession('audio-engine', afterMetrics);

  // 6. Return processed audio (no blocking, no enforcement)
  return processedBuffer;
}
*/

// ============================================================================
// EXAMPLE 4: Toggle Harness On/Off
// ============================================================================

export function toggleHarness(enabled: boolean) {
  perceptualDiffHarness.setEnabled(enabled);
}

// ============================================================================
// EXAMPLE 5: Check Harness Status
// ============================================================================

export function checkHarnessStatus() {
  const status = perceptualDiffHarness.getStatus();
  console.log('Harness Status:', status);
  return status;
}

// ============================================================================
// WHERE TO INTEGRATE (Suggested)
// ============================================================================

/*
Best integration points:

1. src/services/audioEngine.ts
   - Main processing pipeline
   - Wrap processAudio() or similar
   - Capture before/after around full chain

2. src/services/autoMastering.ts
   - Auto-mastering operations
   - Track AI-suggested changes
   - Validate recommendations

3. src/components/[WaveformPlayer or similar]
   - User-triggered processing
   - Compare original vs processed in real-time

Start with ONE integration point.
Validate output with real tracks.
Tune thresholds based on listening.
Then expand or remove.
*/
