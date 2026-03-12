# Echo Sound Lab v2.5

Echo Sound Lab is an AI-native audio environment built around deterministic execution, cryptographic governance, and export provenance.

## Technical Manifesto

Echo Sound Lab is not a traditional DAW clone. The core model is:
- **Intent-driven**: users describe outcomes, the orchestrator emits deterministic APL actions.
- **Zero-trust execution**: high-risk actions require ACC authorization and signed execution payloads.
- **Provable output**: exports ship with cryptographically signed provenance manifests and embedded references.
- **Deterministic collaboration**: timeline state is replayable, branchable, and mergeable by action ledger.

The system guarantees that:
- identical input state + identical APL sequence => identical output state hash
- unauthorized or tampered actions fail closed
- every exported artifact can be tied to an auditable action history

## Architecture Pillars

1. **Provenance (Phase 1)**
- Signed render manifest generation
- WAV/MP3 embedded provenance references
- Tamper-evident verification path

2. **Governance (Phase 2)**
- ACC risk-tier enforcement
- single-use and bounded grants
- forensic security logging

3. **Deterministic Engine (Phase 3)**
- canonical state hashing and replay
- time travel, branch checkout, deterministic merge
- snapshot-assisted replay performance

4. **DSP Factory (Phase 4)**
- manifest-driven plugin registry
- deterministic insert and parameter actions
- Web Audio graph reconciliation with automation scheduling

5. **Orchestration + I/O (Phase 5)**
- natural language intent -> APL proposals
- asset ingestion and waveform rendering
- offline bounce pipeline

6. **Globalization (Phase 6)**
- i18n framework (`en`, `es`, `ko`)
- multilingual AI prompt hardening with stable JSON schema output

## Repository Layout

```text
src/
  components/                 UI including timeline, transport, ACC surfaces
  services/                   execution, governance, audio, provenance, orchestration
  echo-sound-lab/apl/         APL proposal engine and action contracts
tests/e2e/                    Playwright smoke + golden workflow tests
action-authority/             FSM + governance core modules
docs/production/              release and production notes
```

## Local Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173` (or Vite assigned port).

## Validation Gates

```bash
# unit + integration
npm test

# deterministic invariants
npm run ci:determinism

# production bundle
npm run build

# E2E smoke
npm run test:e2e -- --project="Desktop Chrome" tests/e2e/smoke.spec.ts

# Golden Master E2E (full flow)
npm run test:e2e -- --project="Desktop Chrome" tests/e2e/golden-master.spec.ts
```

## Golden Master Workflow (Operator Runbook)

1. Upload audio into Single mode.
2. Generate AI proposals from timeline intent prompt.
3. Authorize proposals through ACC hold-to-arm flow.
4. Export offline WAV bounce.
5. Verify sidecar + embedded provenance metadata.

The golden workflow is automated in:
- `tests/e2e/golden-master.spec.ts`

## Release Commands (v2.5.0)

```bash
# 1) Validate
npm test
npm run ci:determinism
npm run build
npm run test:e2e -- --project="Desktop Chrome" tests/e2e/golden-master.spec.ts

# 2) Package
mkdir -p artifacts/golden-master-v2.5.0
tar -czf artifacts/golden-master-v2.5.0/echo-sound-lab-v2.5.0-dist.tgz dist
shasum -a 256 artifacts/golden-master-v2.5.0/echo-sound-lab-v2.5.0-dist.tgz > artifacts/golden-master-v2.5.0/SHA256SUMS.txt
```

## Notes

- The repository can be dirty from prior archival and document assets. Scope commits to changed code paths.
- Preserve deterministic behavior when introducing new actions or plugin parameters.
- Treat any bypass of ACC/provenance paths as a release blocker.
