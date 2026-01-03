# Audio Engine Contract (Draft)

Status: Ready to lock pending keystone selections.

Goal: Stabilize and clarify the audio engine’s behavior by aligning UI, live preview, offline render, and documentation around a single, explicit contract.

## Keystone Decision (Product Contract)
All subsequent tasks depend on this being locked.

Decision to lock:
- Supported processing surface and parity expectations across live preview and export.

Explicit choices to lock:
- Multiband compression: REMOVED
- Custom DSP path: DEFERRED
- Preview vs export parity: SONICALLY IDENTICAL
- Stereo imaging intent: GLOBAL WIDTH

Acceptance criteria (keystone):
- The chosen options above are reflected consistently in UI, engine behavior, and docs.
- Any feature marked REMOVED or DEFERRED is not reachable from UI or default configs.
- Any feature marked SUPPORTED or ACTIVE has clear activation rules and testable parity expectations.

---

## 1) Processing Surface (What Exists)
Contract:
- The engine exposes only the processors explicitly marked SUPPORTED in the keystone decision.
- The engine does not expose or activate processors that are REMOVED or DEFERRED.

Acceptance criteria:
- UI controls, presets, and configs reference only SUPPORTED processors.
- No warnings occur due to empty or placeholder configs for REMOVED/DEFERRED processors.

## 2) Live Preview Path
Contract:
- Live preview uses a single, documented processing path for all SUPPORTED processors.
- Preview behavior matches the parity choice in the keystone decision.

Acceptance criteria:
- Live preview output matches export within the parity contract.
- Each SUPPORTED processor has a live preview equivalent or is explicitly excluded by contract.

## 3) Offline/Export Path
Contract:
- Export uses a single, documented processing path for all SUPPORTED processors.
- Export behavior matches the parity choice in the keystone decision.

Acceptance criteria:
- Export output matches live preview within the parity contract.
- Export does not silently bypass processors marked SUPPORTED.

## 4) Activation Rules
Contract:
- A processor is active only when its parameters cross explicit activation thresholds.
- The presence of a config object alone does not activate processing.
- Empty objects, undefined values, or default placeholders must not create DSP nodes or trigger validator warnings.
- Activation rules are consistent across UI, live preview, and export.

Acceptance criteria:
- A processor is either inactive (no DSP nodes built) or active (DSP nodes built); no half-active states.
- UI state, engine activation, and validator behavior agree on active vs inactive.
- Multiband (if SUPPORTED): requires explicit band parameter values (not empty objects) to activate.
- Stereo imager activation reflects the chosen intent (banded vs global), including high-band changes.
- No processor activates due to default placeholders alone.

## 5) Defaults and Gain Staging
Contract:
- Defaults are neutral and do not introduce unintended gain changes or coloration.
- Default mix values imply bypassed/no-op processing unless explicitly stated otherwise.
- “Bypassed” means no DSP nodes instantiated, not zero-effect processing.
- Input/output trims remain unity unless explicitly set.
- Limiter default behavior follows the keystone decision (always-on vs opt-in).

Acceptance criteria:
- Default config yields audibly unchanged signal (no-op) when no processing is chosen.
- Default transient/saturation mix values align with stated neutrality.
- Limiter default behavior matches the keystone contract (always-on vs opt-in).
- Default settings do not surprise users with hidden processing.
- Changing a default does not alter DSP node construction unless explicitly intended.

## 6) Diagnostics and Metrics
Contract:
- Diagnostics are explicitly marked as authoritative (may gate decisions) or informational only.
- Placeholder, randomized, or heuristic metrics are non-authoritative by contract.
- Diagnostics must not contradict the engine’s activation state.

Acceptance criteria:
- UI/reporting surfaces label placeholder metrics as non-authoritative.
- No diagnostic output is treated as ground truth unless contractually marked authoritative.
- Placeholder diagnostics cannot trigger warnings, errors, or automated decisions.

## 7) Documentation
Contract:
- Documentation describes the engine exactly as implemented.
- Any removed/deferred features are clearly stated as such.

Acceptance criteria:
- `AUDIO_ENGINE_AUDIT.md` and related docs reflect the locked contract.
- Docs do not claim behavior that differs from the engine’s actual processing path.
