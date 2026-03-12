# Golden Master Release: v2.5.0

Date: 2026-03-11  
Branch: `codex/ai-native-execution-board`

## Scope

This release closes the core development lifecycle with:
- deterministic timeline engine + branch/merge/time-travel
- ACC fail-closed governance
- C2PA-aligned manifest provenance + embedded export references
- 50-plugin DSP factory
- LLM-to-APL orchestration
- i18n localization (`en`, `es`, `ko`)
- Golden Master E2E workflow coverage

## Validation Results

All required gates passed on this branch:

```bash
npm test
npm run ci:determinism
npm run build
PLAYWRIGHT_PORT=5194 npm run test:e2e -- --project="Desktop Chrome" tests/e2e/smoke.spec.ts
PLAYWRIGHT_PORT=5193 npm run test:e2e -- --project="Desktop Chrome" tests/e2e/golden-master.spec.ts
```

Notes:
- Build reports chunk-size warnings and locale static/dynamic import warnings; no blocking failures.
- Golden Master E2E stubs `/api/proxy/security/sign-manifest` to keep the full export path deterministic in static Playwright preview.

## Golden Master Artifact

Artifact directory:

`artifacts/golden-master-v2.5.0/`

Files:
- `echo-sound-lab-v2.5.0-dist.tgz`
- `SHA256SUMS.txt`

SHA-256:

`46e8fb5d0703a6186f94ce8f590ca9ae2d4a7256c53b12a32c37421acf1938fa  artifacts/golden-master-v2.5.0/echo-sound-lab-v2.5.0-dist.tgz`

## Operational Definition of Done

- Unit/integration suites pass.
- Determinism gate passes.
- Production build succeeds.
- E2E smoke passes.
- E2E golden workflow passes: upload -> AI proposal -> ACC authorize -> export with embedded provenance marker + manifest.
- README updated for operator handoff.

## Recommended Post-Release Actions

1. Tag release commit:
   `git tag -a v2.5.0 -m "Echo Sound Lab v2.5.0 Golden Master"`
2. Push branch + tag.
3. Publish the artifact in your release channel with `SHA256SUMS.txt`.
