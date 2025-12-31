# ANME -> APL Read-Only Contract

/**
 * PHASE 1 LOCK - READ-ONLY PERCEPTION SURFACE
 *
 * This file is part of the Phase 1 APL <-> ANME boundary.
 *
 * Invariants:
 * - No control authority
 * - No lifecycle control
 * - No DSP execution
 * - No persistence
 * - No inferred intent
 *
 * Any mutation, execution, or control capability
 * requires a new, versioned contract (Phase 2+).
 */

## 1. Purpose

This contract defines the strict, read-only boundary between the Audio-Native Multimodal Engineer (ANME) and the Audio Perception Layer (APL). It exists to prevent authority leakage, implicit actions, or inference beyond verified perceptual evidence. This contract prioritizes perceptual evidence over inferred intent.

## 2. Non-Goals (Hard No's)

- ANME MUST NOT start, stop, pause, resume, or configure APL.
- ANME MUST NOT request or assume any control over playback or processing.
- ANME MUST NOT persist any APL-derived data beyond the current session.
- ANME MUST NOT fabricate perceptual events or confidence values.
- ANME MUST NOT infer temporal causality (e.g., "because X changed, Y should happen") unless explicitly emitted.

## 3. Authority Boundary

- APL owns perception lifecycle and data emission.
- ANME owns interpretation of read-only APL signals only.
- Authority over audio mutation is outside ANME scope.

## 4. Readable Surfaces

- **Snapshot access**: ANME MAY read the latest APL snapshot when available.
- **Stream subscriptions**: ANME MAY subscribe to APL frame, embedding, change, and state events.
- **Event semantics**: ANME MUST treat all APL events as advisory evidence only, never as actionable triggers.
- Subscription callbacks MUST be treated as non-authoritative signals.

## 5. Confidence and Uncertainty Rules

- If an APL event includes confidence, ANME MUST use it as the primary uncertainty signal.
- If confidence is missing or undefined, ANME MUST treat the signal as low confidence.
- If confidence is below 0.5, ANME MUST ask a clarifying question or defer recommendation.
- ANME MUST NOT imply certainty beyond the supplied confidence.

## 6. Temporal Semantics

- **Snapshot**: a point-in-time view of the most recent APL state and data.
- **Rolling window**: APL embeddings reflect a bounded, recent time window only.
- **No audio available** means no recent APL frames or embeddings are present for the current session.

## 7. Prohibited Inference

ANME MUST NOT infer or assume any of the following unless explicitly provided:
- Genre, style, or reference targets
- Loudness targets or delivery specs
- User intent beyond stated instructions
- Business or release requirements

## 8. Failure Modes

- If APL is unavailable, ANME MUST state that no perceptual data is available.
- If APL is paused, ANME MUST treat signals as stale and avoid new recommendations.
- If APL data is stale, ANME MUST ask for updated playback before advising.

## 9. Forward Compatibility

- Future APL phases MAY add new event types or fields.
- ANME MUST ignore unknown fields and treat unknown event types as advisory only.
- This contract remains read-only regardless of future APL capabilities.
This is the final surface for Phase 1. Any future changes require a new contract version.

## 10. Contract Invariants (Checklist)

- [ ] APL is read-only to ANME.
- [ ] ANME never controls APL lifecycle or configuration.
- [ ] ANME uses APL confidence without inflation.
- [ ] ANME asks when confidence is low or data is missing.
- [ ] ANME does not persist APL-derived data.
- [ ] ANME does not infer unstated intent or targets.
- [ ] ANME never derives control signals from APL output.
