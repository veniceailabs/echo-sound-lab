# Echo Sound Lab Operator Guide (Golden Master v2.5.0)

Last Updated: 2026-03-11  
Audience: Creators, producers, studio operators, support leads

This guide replaces the previous operator guide with production-ready procedures for running Echo Sound Lab safely and consistently.

## 1. What This System Is

Echo Sound Lab is an AI-native audio production environment with:
- deterministic timeline state and replay
- ACC (Action Control Center) governance for AI actions
- cryptographically signed export provenance (C2PA-aligned manifest + embedded file marker)
- multilingual operator surface (`en`, `es`, `ko`)

Core operating model:
1. Ingest audio
2. Analyze
3. Generate proposals (intent -> APL)
4. Authorize actions through ACC
5. Render/export
6. Verify provenance

## 2. Fast Start (10 Minutes)

1. Open app and choose `First Song` + `Friendly`.
2. Upload one source file (or record directly).
3. Confirm `Sonic Analysis` appears.
4. In timeline intent, enter a plain-language prompt.
5. In Intelligence Feed, authorize the proposals you want (`hold` to arm, `Enter` to confirm).
6. Click `Export WAV`.
7. Verify WAV + `.manifest.json` output.

If you only remember one thing: no action should mutate state unless explicitly authorized.

## 3. Profiles, Modes, and When To Use Them

| Choice | Use When | Outcome |
|---|---|---|
| `First Song` | New creators, guided flow | Lowest complexity, highest guardrails |
| `Artist Fast Path` | Experienced creators, speed focus | Faster finish with fewer prompts |
| `Engineer Advanced` | Detailed control and fast iteration | Direct control, timeline-first workflow |
| `Single Track` | One-file mastering loop | Fastest start to finished master |
| `Stems` | Per-part control | Isolated treatment for vocals/drums/bass/music |
| `AI Studio` | Ideation and generation | Prompt-driven proposal flow |
| `Video` | Social/export content | Short-form visual asset workflow |

## 4. Preflight Checklist (Before Every Session)

Run this in order:
1. Device + audio route confirmed (headphones recommended).
2. Browser audio resumed (Safari/iOS needs a user tap).
3. Correct mode selected (`Single` or `Stems` first).
4. File naming convention set (`artist_song_version`).
5. Backup intent noted (what “better” means for this session).

If any step fails, do not start batch changes.

## 5. Session SOP (Standard Operating Procedure)

### Stage A: Ingest
- Upload WAV/MP3/AIFF or record.
- For recording: run one short level check take first.
- For noisy sources: note expected cleanup needs before analysis.

### Stage B: Analyze
- Confirm analysis populated (loudness, dynamics, balance).
- Read plain-language summary before accepting proposals.
- Avoid applying changes if analysis did not complete.

### Stage C: Propose
- Use clear intent prompt examples:
  - “Make vocals aggressive with FET compression.”
  - “Add air and short slap delay.”
  - “Tighten low end without pumping.”
- Expect proposal cards in Intelligence Feed.

### Stage D: Authorize (ACC)
- Each proposal requires deliberate authorization.
- Interaction pattern:
  1. Hold on proposal button until armed.
  2. Press `Enter` to confirm.
  3. Verify state change in timeline/history.
- If uncertain, do not authorize; leave pending.

### Stage E: Review
- Use A/B (loudness-matched) before export.
- Validate no accidental over-brightness, over-limiting, or vocal flattening.
- Check active chain reflects intended actions only.

### Stage F: Export
- Use WAV for archive and transfer.
- Use MP3 for rapid approvals.
- Use background queue to continue work without interruption.

## 6. Recording & Vocal Operations

Best baseline:
- quiet room
- mic 4-8 inches from source
- headphone monitoring
- one clean test take

Feature usage:
- Smart Comping: build best pass from multiple takes.
- Honest Tuner: light correction first; increase only if needed.
- Vocal textures: stylistic layer, not a replacement for performance.

## 7. Deterministic Timeline Operations

Timeline supports controlled editing with deterministic replay:
- add/move/split regions
- add tracks
- plugin insert/parameter actions
- automation points
- history scrub + restore
- branch + merge

Operator rules:
1. Use history scrub in read-only preview mode first.
2. Use `Restore` explicitly when you want to truncate forward history.
3. Branch before risky edits.
4. Merge only after conflict review.

## 8. AI Proposal Governance (Zero-Trust)

Governance tiers:
- `LOW`: can auto-execute under some templates
- `MEDIUM`: often requires review
- `HIGH`: explicit ACC approval required

Template intent:
- Full Autonomy: speed-biased
- Co-Pilot: balanced default
- Strict Review: approval-heavy, safest

Operational security principle:
- If ACC cannot validate grant/signature/nonce, action must fail closed.

## 9. Stems and Multi-Track Strategy

When stems are available:
- import isolated tracks first
- prioritize vocal and drum relationships

When stems are not available:
- run splitter
- treat confidence levels literally:
  - high: proceed
  - medium: proceed with caution
  - low: source better stems for release

## 10. Export, Provenance, and Verification

Every release candidate should include:
- audio file (`.wav` preferred)
- sidecar manifest (`.manifest.json`)

### Quick Marker Check (WAV)

```bash
node -e "const fs=require('fs');const b=fs.readFileSync(process.argv[1]);console.log(b.includes(Buffer.from('ESL_PROVENANCE_REF'))?'marker-present':'marker-missing')" ./your-export.wav
```

Expected: `marker-present`

### What To Verify in Manifest

- `signature` exists
- `manifestHash` exists
- `signatureAlgorithm` is present
- entries map to approved actions

If any field is missing, block handoff and re-export.

## 11. Collaboration and Revision Control

Use this format for team comments:
- “Raise chorus vocal +1.5 dB”
- “Preserve kick transient, less limiter grab”
- “Increase width only in final chorus”

Do not use vague comments like “make it better.”

Always compare revisions by specific objective:
- clarity
- punch
- vocal position
- translation

## 12. Troubleshooting Matrix

| Problem | Likely Cause | Action |
|---|---|---|
| No sound (iOS/Safari) | Context suspended | Tap resume/play control once |
| Proposal won’t execute | ACC not armed or blocked | Hold until armed, press `Enter`, verify policy state |
| Export missing | Render/sign step failed | Re-run export; confirm manifest endpoint availability |
| UI action appears disabled | Prerequisite unmet | Read helper text under control; complete prior stage |
| Session reopened unexpectedly | Browser refresh/crash | Use restore session prompt; verify timeline hash |

## 13. Incident / Support Handoff

Before escalation, collect:
1. Repro steps in order
2. Device + browser + OS version
3. Time of event
4. Copy Debug Info output
5. If export issue: include WAV + manifest + marker check result

Send this package once; avoid fragmented follow-ups.

## 14. Daily Operator Checklist

Start of day:
- confirm build/version
- confirm audio output path
- run one upload/analyze smoke pass

During sessions:
- branch before risky edits
- authorize only understood proposals
- verify by ear before export

End of day:
- export final + backup revision
- archive manifest with deliverable
- note unresolved issues in handoff log

## 15. Go / No-Go Release Gate

Release is `GO` only if all are true:
- deterministic gate passes
- exports include signed manifest
- WAV marker present
- no unresolved ACC bypass/tamper errors
- final A/B approved by operator

Any failure is `NO-GO`.

## 16. Operator Notes for Scaling

As project complexity grows:
1. Keep intent prompts precise and scoped.
2. Add plugins through manifest + deterministic action path only.
3. Avoid manual side-channel mutations outside ExecutionService.
4. Treat provenance failures as release blockers.

The platform is strongest when every action remains reviewable, replayable, and verifiable.
