# Audio Perception Layer (APL) - Phase Implementation Plan

**Objective:** Ship the Audio Perception Layer in controlled phases with zero DSP impact and no implicit processing.
**Scope:** Local, session-scoped perception only. No automation, no refactors, no model training.
**Risk Level:** Low to moderate, gated by feature flags and explicit user action.

---

## Non-Negotiables (All Phases)

- Local only. No cloud or network inference.
- Session-scoped memory only. No persistence without explicit export.
- No training or dataset collection on user audio.
- APL is listen-only. It must never apply DSP or modify buffers.
- APL must not trigger processing on load or mount.
- Any APL failure must be non-blocking to playback and UI.

---

## Phase 0 - Listen-Only Bootstrapping

**Goal:** Prove APL can listen and describe audio without touching DSP or UI.

**Inputs:**
- Audio playback stream (post-decoding, read-only tap)
- Audio file metadata (duration, sample rate)

**Outputs:**
- Low-rate perceptual frames (tone, dynamics, density)
- Console-only logs (dev flag only)

**Explicitly Not Allowed:**
- No UI output
- No automation or DSP actions
- No persistence or export
- No hidden auto-start on load or mount

**Success Criteria:**
- APL can be started only by explicit user action (play or analyze)
- Logs show stable, deterministic perceptual frames
- No change in audio output or buffer integrity
- APL can be toggled off instantly via feature flag

---

## Phase 1 - Embedding Pipeline (Session Memory)

**Goal:** Convert frames into short-term perceptual embeddings and summaries.

**Inputs:**
- Perceptual frames from Phase 0
- Section markers (optional: verse/chorus tags if present)

**Outputs:**
- Rolling embeddings (session memory)
- Summary descriptors (tone, motion, intensity)
- Change detection events (brighter, denser, louder)

**Explicitly Not Allowed:**
- No UI display
- No plugin selection or DSP action
- No persistence across sessions

**Success Criteria:**
- Embeddings update in near-real time (sub-200ms response)
- Change detection is stable and explainable
- Session memory resets on new session start

---

## Phase 2 - Reference Perception (Comparison Only)

**Goal:** Enable perceptual comparison between current audio and a reference track.

**Inputs:**
- Live session embeddings
- Reference track embeddings (listen-only, same pipeline)

**Outputs:**
- Perceptual deltas (density, brightness, dynamics, space)
- Confidence scores and summary text (internal only)

**Explicitly Not Allowed:**
- No EQ matching or auto-correction
- No UI output beyond dev logs
- No persistence or export without user action

**Success Criteria:**
- Reference comparison runs locally and deterministically
- No changes to audio output
- No hidden processing on file load

---

## Phase 3 - Read-Only Consumer Feeds

**Goal:** Provide safe, read-only APL signals to other systems.

**Inputs:**
- Embeddings, deltas, and change events

**Outputs:**
- Read-only event stream for Self Session, plugins, and UI
- Structured payloads with versioned schemas

**Explicitly Not Allowed:**
- No automatic DSP or plugin actions
- No UI automation
- No writing of user data to disk

**Success Criteria:**
- Consumers can subscribe without affecting audio
- APL signals are schema-validated and stable
- APL can be shut down without impacting other systems

---

## Phase 4 - Controlled, Explicit UI Surfacing

**Goal:** Expose APL insights to the user in a minimal, opt-in UI.

**Inputs:**
- Read-only APL signals (Phase 3)

**Outputs:**
- UI indicators (informational only)
- User-visible session summary panel

**Explicitly Not Allowed:**
- No auto-apply or DSP automation
- No hidden toggles or background analysis
- No export unless user explicitly requests

**Success Criteria:**
- UI shows APL state clearly (listening, paused, off)
- User can start/stop APL with explicit control
- Audio remains bit-identical unless user applies fixes

---

## Rollback Plan (All Phases)

- A single feature flag disables APL entirely.
- APL components are isolated and do not block playback.
- Disabling APL leaves UI and DSP behavior unchanged.

---

## Phase Completion Gate

Phase N is complete only when:
- All success criteria are met
- No audio integrity violations are observed
- Manual listening confirms no unintended processing

