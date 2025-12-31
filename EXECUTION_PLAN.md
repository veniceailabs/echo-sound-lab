# Execution Plan - Audio Engine Stabilization

Status: Locked to AUDIO_ENGINE_CONTRACT.md (keystone decisions already set).

Goal: Execute Phase 1-4 to reduce ambiguity, align preview/export parity, and clean up UI/engine/docs/tests.

## Phase 1 - High-clarity removals (fast, low risk)
- Remove multiband from UI controls and UI state initialization. Tags: UI. Risk: Medium.
- Remove multiband from presets/default configs and any AI/auto-config outputs. Tags: UI, Engine. Risk: Low-Medium.
- Remove multiband references from history/timeline/labels/filtering. Tags: UI. Risk: Low.
- Remove multiband validator usage paths and warnings from engine build/preview/export. Tags: Engine. Risk: Low.
- Ensure multiband DSP node creation paths are unreachable. Tags: Engine. Risk: Low.
- Type surface change: keep multiband field read-only/ignored for one version; remove behavior before removing shape. Tags: Engine, Docs. Risk: Medium.

## Phase 2 - Parity enforcement (core trust)
- Define the single authoritative processing order for preview/export (per contract). Tags: Engine, Docs. Risk: Medium.
- Align live preview dynamics path to match export behavior. Tags: Engine. Risk: Medium-High.
- Normalize limiter behavior to match contract (opt-in vs always-on). Tags: Engine, UI. Risk: Medium.
- Ensure any excluded processor is explicitly documented and not silently bypassed. Tags: Docs, UI. Risk: Low.
- Add a minimal parity validation test (RMS over time window, peak, integrated LUFS). Tags: Tests. Risk: Low.
- Add a release note: "Live preview now matches export exactly (no hidden loudness differences)." Tags: Docs. Risk: Low.

## Phase 3 - Stereo imager cleanup (global width)
- Collapse UI to a single global width control; remove banded inputs. Tags: UI. Risk: Medium.
- Simplify activation logic to global width only. Tags: Engine, UI. Risk: Low.
- Ensure any width change builds DSP nodes consistently. Tags: Engine. Risk: Low.
- Update presets/configs that set banded widths using deterministic mapping:
  - If any band != 0, map GLOBAL WIDTH = average or max.
  - If all bands = 0, width = 0 (inactive).
  Tags: UI, Engine, Docs. Risk: Low.

## Phase 4 - Clarity + hygiene
- Label diagnostics as authoritative vs informational in UI/reporting. Tags: UI, Docs. Risk: Low.
- Gate placeholder metrics from warnings/errors/automation. Tags: Engine, UI. Risk: Low.
- Update docs/audit to align with contract. Tags: Docs. Risk: None.
- Add sanity tests for activation rules and default no-op behavior. Tags: Tests, Engine. Risk: Low.

## Notes / Risk Flags
- Remove behavior before removing schema fields to avoid breaking saved state.
- Parity alignment is the highest audible-impact change; communicate clearly.
- Minimal parity test should include RMS over time window, peak, and integrated LUFS.
