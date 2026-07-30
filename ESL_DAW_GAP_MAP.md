# Echo Sound Lab DAW Gap Map

Date: 2026-06-19

This document is a conservative status snapshot of the current ESL checkout against the active execution plan.
It distinguishes verified implementation from partial coverage and remaining gaps.

Current verification state:
- `npx tsc --noEmit` passes on the current checkout
- `npm run build` passes on the current checkout
- `https://echo-sound-lab.vercel.app/` is aliased to the latest Vercel validation deployment

## 1. Session Foundation

Status: Implemented and verified locally and in the live deploy

Verified evidence:
- Persistent session storage in `src/services/studioSessionStorage.ts`
- Durable asset registry in `src/services/AssetRegistry.ts`
- Media pool import and placement in `src/components/AlbumStudio.tsx`
- Timeline hydration via `src/components/TimelineWorkspace.tsx`
- Session recovery and autosave hooks via `src/services/coreApi.ts` and `src/components/AlbumStudio.tsx`
- Live deployment verification after the latest frontend updates
- `npx tsc --noEmit` and `npm run build` have passed after these changes

Remaining gaps:
- Remote recovery now surfaces a restore prompt when a newer session is detected in another tab, and the recording console now persists its channel mode
- Recovery bundle merge is present, but a true multi-device cloud reconciliation workflow is still not automatic

## 2. Timeline Editing

Status: Implemented in the core editor surface

Verified evidence:
- Snap-to-grid and snapping controls in `src/components/RegionLane.tsx`
- Keyboard region editing, undo/redo, and snap state in `src/components/TimelineWorkspace.tsx`
- Non-destructive region workflows are present
- The landing page now surfaces the same studio brand shell as the main app

Remaining gaps:
- Region warp/stretch and more advanced clip comping are not yet DAW-complete
- Large-session editing stress behavior still needs focused load testing

## 3. Routing and Mix State

Status: Partially implemented, moving toward DAW-grade

Verified evidence:
- Routing and bus-oriented UI exists in `src/components/RoutingGraphPanel.tsx` and `src/components/TrackRoutingPanel.tsx`
- Track state already persists volume, pan, mute, solo, sends, and bus IDs in the studio session stack
- Mix-state handling is now wired through the public mastering/export flow
- Constant-power panning and mix-state controls have been implemented in the current studio surface

Remaining gaps:
- Full sidechain bus behavior is not yet wired end to end
- Complex send/return automation and dedicated mix-state playback still need more coverage

## 4. Recording and Monitoring

Status: Strong core implementation, one key host capture gap remains

Verified evidence:
- `AlbumStudio.tsx` includes armed-track recording, monitoring, punch-in/out, and take folders
- `src/hooks/useRecorder.ts` provides browser recording support
- Waveform capture exists for recorded takes
- Direct previous/next take controls were added to the region block so comping is not hidden behind a dropdown

Remaining gaps:
- MIDI synth capture is still host-unified but not yet surfaced as a first-class recorded take path in every entry point
- Latency compensation beyond basic monitoring is not fully characterized

## 5. Plugin Rack

Status: Broadly implemented

Verified evidence:
- Multiple effect panels and the playback engine are present
- Parameter automation mappings were expanded in `src/services/AudioPlaybackEngine.ts`
- Local preset recall/saving is available in the rack UI

Remaining gaps:
- Some advanced parameter automation and rack preset flows still need more end-to-end proof

## 6. MIDI and Composition

Status: Present, but not fully DAW-complete

Verified evidence:
- `src/components/MidiSynth.tsx` provides a playable browser synth
- `AlbumStudio.tsx` already exposes the synth panel in the main studio shell
- Synth note events are now captured into the studio session and can be exported as a quantized MIDI lane
- `src/services/midiCompositionService.ts` now backs the export package path used by the studio panel
- `AlbumStudio.tsx` now exposes the captured synth notes as an editable MIDI piano-roll lane in the main recording workflow

Remaining gaps:
- MIDI import/export and piano-roll editing are still stronger in the timeline/editor surfaces than in all other studio entry points
- The synth capture lane still needs deeper session timeline reconciliation and take-level editing

## 7. Automation

Status: Strong progress

Verified evidence:
- Automation playback mappings are expanded in `src/services/AudioPlaybackEngine.ts`
- Timeline editing shortcuts and deterministic replay hooks are present
- Public-facing advanced control toggles now default off to keep the demo focused
- Master automation lanes now expose LUFS and limiter threshold targets

Remaining gaps:
- Dedicated automation lane UX and section-aware mastering automation remain incomplete

## 8. Performance and Reliability

Status: Good baseline, further hardening needed

Verified evidence:
- Build and type-check pass on the current state
- Session persistence and recovery helpers exist
- Vercel production deploy has been refreshed after the latest UI and comping changes
- Offline render jobs now run through a serialized queue with cleanup hooks
- Render queue regression coverage exists in `src/tests/renderQueueService.test.ts`
- Large-session benchmark coverage exists in `src/tests/sessionBenchmarkService.test.ts`
- Storage-backed recovery drill coverage exists in `src/tests/studioSessionRecoveryStorage.test.ts`
- Workspace sandbox cleanup coverage exists in `src/tests/workspaceSandboxService.test.ts`
- Workspace sandbox delivery planning is now surfaced in `src/services/studioMoonshotExecutionService.ts` and `src/components/StudioMoonshotExecutionPanel.tsx`

Remaining gaps:
- Direct archive handoff from the export renderer into the delivery vault is staged in the public proxy path, but live end-to-end smoke coverage should still be expanded

## 9. Public Proof and Service Delivery

Status: Well underway

Verified evidence:
- Public landing page and proof flow exist
- `src/components/PublicDownloadPage.tsx` gates paid downloads
- Core API client methods exist in `src/services/coreApi.ts`
- Public landing and download pages now share the same studio brand treatment
- Live deployment is verified on the current production alias
- Public landing and download gating are smoke-tested across desktop and mobile browser profiles in `tests/e2e/public-proof.spec.ts`

Remaining gaps:
- Direct archive release still depends on backend job/payment state and should continue to be exercised against real paid jobs
- Browser-side public proof is verified, but paid-job smoke coverage should still be expanded against real backend jobs

## 10. Competitive Rescore

Status: Not final

What is true now:
- ESL is materially stronger than it was at the start of the sprint
- The current checkout still has specific gaps in host capture, advanced routing, and larger-session performance verification

What is still missing for a true 10:
- Full routing depth
- Recording capture completeness
- MIDI composition completeness is improving, but it still needs broader entry-point parity and deeper session reconciliation
- Reliability under larger sessions
- Verified live deploy behavior now exists for the current public alias and the public proof funnel smoke tests
- Remaining DAW categories are still behind Logic/Pro Tools on deep session editing, routing, and host capture depth
