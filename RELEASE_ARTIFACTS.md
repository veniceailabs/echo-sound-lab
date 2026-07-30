# RELEASE_ARTIFACTS (Golden Master v2.5.0)

## Release Identity

- Final commit hash (`git rev-parse HEAD`): `b0b5e2d95b31cee2e39d604ef9a9bef09d529e48`
- Release tag: `v2.5.0`
- Tag annotation: `Golden Master Release: AI-Native Governance & DSP Suite`

## Certification Test Summary

- Unit + integration (`npm test`): `68/68` tests passed
- Determinism gate (`npm run ci:determinism`): `19/19` tests passed
- Golden Master E2E (`PLAYWRIGHT_PORT=5293 npx playwright test --project="Desktop Chrome" tests/e2e/golden-master.spec.ts`): `1/1` passed
- Total test coverage count (certification run): `88` tests executed, `88` passed

## Core Build Checksums (SHA-256)

```text
30c36a8b292b58f4de83618191ca1d5d17f8153ae782420afdf7401f19bd20dc  dist/index.html
46bbb19757a87d3113f018f0632abed3fbc0112c8eeb78d49a74772ab6c49460  dist/assets/index-B0ZT3_Lk.js
54f0aa15bb4ebfa6766bae5798fd02c085df52b3ea6891b8a9c345c5bc54a80b  dist/assets/index-Bk8DEPJi.css
a47ef6347f9cb21f81753993e676909662ebe0d6a2d429ab309e7f1b111e0103  dist/assets/vendor-audio-Dw8JFUk_.js
1509f8623de60f42dbad78cbe12e16f76184cdbbef4765011d360ab331f63f1c  artifacts/golden-master-v2.5.0/echo-sound-lab-v2.5.0-dist.tgz
```

## Cert of Determinism

This release is certified deterministic:
- `npm run ci:determinism` passed with no failures.
- Deterministic replay/action harnesses passed across replay, branch checkout, merge, and timeline action suites.

## Artifact Package

- `artifacts/golden-master-v2.5.0/echo-sound-lab-v2.5.0-dist.tgz`
- `artifacts/golden-master-v2.5.0/SHA256SUMS.txt`
