# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] - 2026-03-12

### Added
- Sovereign Architecture mode for zero-cost operation with premium third-party integrations disabled by default.
- Native Web Audio visual layer via `NativeVisualizer` connected to the studio master analyser path.
- Native browser speech fallback service via `nativeVoiceService` using Web Speech APIs for no-cost TTS support.
- Production environment checklist defining required vs optional keys for deployment.

### Changed
- Backend consolidated to a single Vercel catch-all router for API handling, reducing cold-start fragmentation and avoiding hobby-plan function sprawl.
- Gemini orchestration upgraded to `gemini-3.1-pro-preview` with server-side model override support.
- Premium integration endpoints (Suno, premium voice, Animate Art) now respect runtime feature flags and fail closed with explicit `403` responses when disabled.
- AI Studio and song-generation UX now degrade gracefully under zero-cost mode while preserving core studio workflows.

### Security
- ACC governance model retained with single-use execution token flow and fail-closed enforcement paths.
- Provenance export pathway remains cryptographically verifiable (C2PA-aligned manifest sidecars and embedded metadata references).

### Engine
- Deterministic replay core remains intact, including hash-stable action execution, time travel, and branch/merge state workflows.
- 50-plugin Web Audio DSP factory remains available with deterministic parameter/automation behavior.

### Documentation
- Formalized release record for Golden Master `v2.5.0` and its Phase 8 sovereign architecture outcomes.
- Declared repository lock for the `v2.5.0` production lifecycle (no additional feature development under this release line).

