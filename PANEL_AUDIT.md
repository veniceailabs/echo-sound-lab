# PANEL_AUDIT

Last updated: 2026-06-25

This is the Phase 0 panel audit for the current Echo Sound Lab checkout.

Scope:
- Current mounted panels in `src/App.tsx`
- Routed admin/ops surfaces in `src/index.tsx`
- Visibility gates driven by `src/config/featureFlags.ts`

Classification:
- `REAL`: mounted, reachable, and intended to ship in the current product surface.
- `PARTIAL`: mounted and functional, but still outside a proven market-ready workflow.
- `SIMULATED`: scaffolded or experimental surface that should stay hidden from production.
- `DEAD`: not currently mounted and not part of the verified product surface.

## Public / Friendly Surface

| Panel | Status | Notes |
| --- | --- | --- |
| `LandingPage` | REAL | Public front door on `/` with guided entry and upload CTA. |
| `ConsumerGuidedWizard` | REAL | Friendly `/app` flow for single-track users. |
| `ProofPlayer` in the wizard | REAL | Provides before/after listening in the guided path. |
| `PricingPage` | REAL | Routed from the landing page and `src/index.tsx`. |

## Core App Surface

| Panel | Status | Notes |
| --- | --- | --- |
| Upload / mastering card | REAL | Default single/pro flow in `src/App.tsx` with the main upload action first. |
| `StudioCommandCenter` | REAL | Mounted in the main workspace as the primary control surface. |
| `StudioProConsole` | REAL | Dense operational surface with session/package and routing controls. |
| Sonic analysis block | REAL | Mounted in the main workspace as `data-studio-section="analysis"`. |
| Album dashboard | PARTIAL | Real workflow, but still an extra decision surface rather than part of the one-step default path. |
| Collaboration panel | PARTIAL | Reachable and functional, but not yet part of a proven collaborative release workflow. |
| Timeline workspace | PARTIAL | Present and active, but parity and integration are still under roadmap work. |
| Multi-stem workspace | PARTIAL | Real panel, but the full DAW-grade editing promise is not yet proven. |
| `AI Studio` / `AlbumStudio` route | PARTIAL | Beta-oriented surface; AI Studio entry is now hidden from production by `SHOW_BETA_STUDIO_SURFACES`. |
| `VideoEngine` route | PARTIAL | Real routed mode, but not part of the core mastering story. |

## Ops / Governance

| Panel | Status | Notes |
| --- | --- | --- |
| `ReleaseGatesDashboard` | REAL | Internal `/admin/release-gates` route is wired in `src/index.tsx`. |
| `ProductOpsDashboard` | REAL | Internal ops surface; public landing shortcuts are now hidden in production by `SHOW_INTERNAL_OPS_SURFACES`. |
| `AdminQueueDashboard` | REAL | Internal admin route wired in `src/index.tsx`. |
| `ProofTrainerPanel` | REAL | Present in the ops area for preflight and proof workflow control. |
| `VocalChainControlsPanel` | PARTIAL | Real DSP UI, but not a verified replacement for a full vocal workflow. |

## Experimental Surfaces

These are gated behind `FEATURE_FLAGS.SHOW_EXPERIMENTAL_STUDIO_SURFACES` and should remain hidden from production.

| Panel | Status | Notes |
| --- | --- | --- |
| `StudioFlashbackPanel` / capture lab | SIMULATED | Useful for internal capture and restore exploration, not public-facing. |
| `StudioFutureStackPanel` | SIMULATED | Roadmap surface for future parity concepts. |
| `StudioDawReadinessPanel` | SIMULATED | Audit / roadmap view, not a core user workflow. |
| `StudioMoonshotExecutionPanel` | SIMULATED | Experimental execution surface, production-hidden. |
| `StudioHardwarePanel` | SIMULATED | Control-surface and hardware exploration surface, not part of the current launch path. |
| `StudioRecoveryPanel` | SIMULATED | Internal recovery tooling that is not a user-facing feature claim. |
| `capture-lab` section | SIMULATED | Hidden by default through the feature flag. |
| `post-workflow` section | SIMULATED | Hidden by default through the feature flag. |
| `recovery` section | SIMULATED | Hidden by default through the feature flag. |

## Hidden or Not Confirmed

| Panel | Status | Notes |
| --- | --- | --- |
| `StudioBrand` version badge text | REAL, but removed from the footer badge path | The stray floating badge was removed from the page; header branding remains. |
| Any component under `src/components/` not mounted from `App.tsx` or a routed entry | DEAD until mounted | Keep it out of public claim language unless a route or test proves it reachable. |

## Production Rules

- Anything marked `PARTIAL` or `SIMULATED` must not be marketed as completed.
- Anything behind `SHOW_EXPERIMENTAL_STUDIO_SURFACES` must stay hidden in production unless the gate is explicitly opened.
- Anything behind `SHOW_INTERNAL_OPS_SURFACES`, `SHOW_BETA_STUDIO_SURFACES`, or `SHOW_REFERENCE_MATCHING_EXPERIMENTS` must stay out of the public production flow unless the gate is explicitly opened.
- If a panel does not have a route, mount point, or test path, it is not a public claim.

## Follow-Up

- Keep this file aligned with `VERIFIED_CLAIMS.md`.
- Reclassify panels only after the live route and verification path are updated.
