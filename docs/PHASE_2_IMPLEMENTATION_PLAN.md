# Phase 2: Thin Integration Layer (Read-Only)

**Objective:** Wire Frontend → Listening Pass Service. No LLM. No UI changes.
**Scope:** Perception layer only. Deterministic, schema-compliant output.
**Risk Level:** Minimal (feature-flagged, dev-only logging, no DSP impact)

---

## 1. IMPLEMENTATION SCOPE (Surgical)

### What Gets Added
- ✅ Service import in upload handler
- ✅ Listening Pass call on audio decode
- ✅ Feature flag check (toggles analysis on/off)
- ✅ Dev-only JSON logging at boundary
- ✅ Error handling for analysis failures

### What Does NOT Change
- ❌ DSP engine (untouched)
- ❌ UI components (untouched)
- ❌ Audio processing pipeline (untouched)
- ❌ Gemini/LLM integration (Phase 3)
- ❌ Existing upload flows (feature-flagged)

---

## 2. HOOK POINT: AUDIO UPLOAD HANDLER

**Current Flow (simplified):**
```typescript
// In App.tsx or AudioUploadModal.tsx
async function handleAudioUpload(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Trigger analysis/processing
  await audioEngine.loadFile(file);
}
```

**Modified Flow (Phase 2):**
```typescript
async function handleAudioUpload(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // NEW: Wire Listening Pass (if feature-flagged)
  if (FEATURE_FLAGS.LISTENING_PASS_ENABLED) {
    try {
      const listeningPassResult = await listeningPassService.analyzeAudio({
        audioBuffer: audioBuffer,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        metadata: {
          // Optional: extract from user input
          genre: selectedGenre || undefined,
          bpm: selectedBpm || undefined,
        },
        mode: selectedMode || 'friendly', // From user mode selection
      });

      // Dev-only logging (console.log, no UI impact)
      if (ENVIRONMENT === 'development') {
        console.log('[Listening Pass Result]', listeningPassResult);
      }

      // Store result for Phase 3 (LLM reasoning)
      // Currently: no-op, just validates it ran
      this.setState({ listeningPassResult });
    } catch (error) {
      console.error('[Listening Pass Error]', error);
      // Fail gracefully: continue without analysis
      // DSP and UI flows unaffected
    }
  }

  // Existing flow continues (unmodified)
  await audioEngine.loadFile(file);
}
```

---

## 3. FEATURE FLAG STRUCTURE

**Location:** `src/config/featureFlags.ts` (new file)

```typescript
/**
 * Feature Flags - Controls experimental features
 * Change these to control rollout and testing
 */

export const FEATURE_FLAGS = {
  /**
   * LISTENING_PASS_ENABLED
   * - When true: Listening Pass runs on every audio upload
   * - When false: Skipped (existing flows unchanged)
   * - Default: true (can toggle instantly in dev tools)
   */
  LISTENING_PASS_ENABLED: true,

  /**
   * LISTENING_PASS_LOG_ENABLED
   * - When true: Logs raw Listening Pass JSON to console
   * - When false: Logs only errors
   * - Default: true in development, false in production
   */
  LISTENING_PASS_LOG_ENABLED: process.env.NODE_ENV === 'development',

  /**
   * LISTENING_PASS_SHOW_REPORT_CARD
   * - When true: Renders Echo Report Card in UI (Phase 4)
   * - When false: Skipped
   * - Default: false (Phase 3+)
   */
  LISTENING_PASS_SHOW_REPORT_CARD: false,
} as const;

/**
 * Runtime toggle (dev tools only)
 * Usage: window.__DEBUG__.toggleListeningPass()
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__DEBUG__ = {
    toggleListeningPass: () => {
      FEATURE_FLAGS.LISTENING_PASS_ENABLED = !FEATURE_FLAGS.LISTENING_PASS_ENABLED;
      console.log(
        `[DEBUG] Listening Pass ${FEATURE_FLAGS.LISTENING_PASS_ENABLED ? 'ENABLED' : 'DISABLED'}`
      );
    },
    getFeatureFlags: () => FEATURE_FLAGS,
  };
}
```

**Usage in upload handler:**
```typescript
import { FEATURE_FLAGS } from '../config/featureFlags';

if (FEATURE_FLAGS.LISTENING_PASS_ENABLED) {
  // Run analysis
}
```

---

## 4. DEV-ONLY LOGGING BOUNDARIES

**What gets logged (development only):**

```typescript
// Console output (dev tools > Console tab)
[Listening Pass Result] {
  mode: "friendly",
  listening_pass: {
    version: "1.0",
    analysis_confidence: 0.88,
    tokens: [...],
    priority_summary: {...}
  },
  _analysis: {...}
}

[Listening Pass Timing] 285ms
```

**What does NOT get logged:**
- ❌ No UI popups or notifications
- ❌ No recommendation display
- ❌ No changes to existing output
- ❌ No LLM calls (Phase 3)

**Toggle logging:**
```typescript
// In browser console (dev only):
window.__DEBUG__.getFeatureFlags() // See current state
window.__DEBUG__.toggleListeningPass() // Disable/enable instantly
```

---

## 5. ERROR HANDLING (Fail Gracefully)

**If Listening Pass fails:**
```typescript
try {
  const result = await listeningPassService.analyzeAudio(...);
  // Log success
} catch (error) {
  console.error('[Listening Pass Error]', error.message);
  // Continue without analysis
  // DSP flow unaffected
  // No UI impact
}
```

**Acceptable failure scenarios:**
- Audio decoding error → caught at step 2 (audio read)
- Service timeout → analyzed in Phase 2 metrics
- Invalid audio (< 1 second) → validation in service
- Memory constraints → handled by browser

**Result:** Analysis is non-blocking. If it fails, user still uploads, DSP still works.

---

## 6. INTEGRATION POINTS (Files to Modify)

### 1. **`src/services/listeningPassService.ts`**
   - ✅ Already complete (no changes)
   - Location verified: `/Echo Sound Lab v2.5/src/services/`

### 2. **`src/config/featureFlags.ts`** (NEW)
   - Create with LISTENING_PASS_ENABLED flag
   - Dev-only runtime toggle
   - ~50 lines

### 3. **`src/components/AudioUploadModal.tsx`** (or similar)
   - Import featureFlags
   - Import listeningPassService
   - Add Listening Pass call in upload handler
   - ~20 lines added
   - Existing code unchanged (wrapped in feature flag)

### 4. **`src/types.ts`** (optional enhancement)
   - Add optional type for storing result:
     ```typescript
     interface AppState {
       // ... existing
       listeningPassResult?: ListeningPassOutput;
     }
     ```

---

## 7. ACCEPTANCE CRITERIA CHECKLIST

Before Phase 2 is approved complete:

### ✅ Listening Pass Runs
- [ ] Service imported correctly
- [ ] Called after audio decode
- [ ] Receives correct audioBuffer, sampleRate, duration
- [ ] No errors on test upload

### ✅ Output Matches Schema
- [ ] Result structure matches `ListeningPassOutput` interface
- [ ] All required fields present
- [ ] No extra fields (schema compliance)
- [ ] JSON validates against `LISTENING_PASS_OUTPUT_SCHEMA.md v1.0`

### ✅ No Regressions
- [ ] Existing upload flow still works (with feature flag OFF)
- [ ] Audio processing unaffected
- [ ] UI rendering unchanged
- [ ] No console errors (except dev logs)
- [ ] Audio playback works normally

### ✅ Feature Flag Works
- [ ] Can toggle on/off instantly in dev console
- [ ] When OFF: Listening Pass call skipped entirely
- [ ] When ON: Analysis runs every time
- [ ] Logging controlled by LISTENING_PASS_LOG_ENABLED

### ✅ Dev Logging Clear
- [ ] Raw JSON visible in console (dev mode)
- [ ] Timing logged (~285ms expected)
- [ ] Error cases logged with full stack trace
- [ ] No noise or spam in console

---

## 8. TESTING STRATEGY (Phase 2)

### Manual Testing
1. **Toggle Feature Flag OFF:**
   - Upload audio
   - Verify existing flow works unchanged
   - Check console (no Listening Pass logs)

2. **Toggle Feature Flag ON:**
   - Upload audio
   - Check console for raw JSON
   - Verify schema structure
   - Test with different audio formats (mono, stereo, various sample rates)

3. **Error Cases:**
   - Corrupt audio file → verify graceful error
   - Very short audio (<1s) → verify error handling
   - Large audio (>1GB) → verify timeout/memory handling

### Schema Validation
- Run JSON output through schema validator
- Verify confidence values are deterministic (same audio → same confidence)
- Verify no 'N/A' or invalid enum values

---

## 9. PERFORMANCE METRICS (Phase 2 Baseline)

Track during Phase 2:
- Analysis time per audio duration (should be ~285ms for 3-minute track)
- Memory usage (should be <300KB working memory)
- Error rate (should be 0% for valid audio)
- Feature flag toggle responsiveness (should be instant)

**Logging:**
```typescript
const startTime = performance.now();
const result = await listeningPassService.analyzeAudio(...);
const elapsed = performance.now() - startTime;
console.log(`[Listening Pass Timing] ${elapsed.toFixed(1)}ms`);
```

---

## 10. ROLLBACK PLAN (Instant Disable)

**If problems arise:**
```typescript
// In featureFlags.ts, one-line change:
LISTENING_PASS_ENABLED: false, // Disable instantly

// All existing flows continue unchanged
// No rebuild required
// No UI impact
```

---

## 11. FILES TO CREATE/MODIFY

| File | Action | Lines | Risk |
|------|--------|-------|------|
| `src/config/featureFlags.ts` | CREATE | ~50 | None (isolated) |
| `src/components/AudioUploadModal.tsx` | MODIFY | +20 | Low (wrapped in flag) |
| `src/services/listeningPassService.ts` | REFERENCE | 0 | None (already done) |
| `src/types.ts` | OPTIONAL | +3 | None (optional) |

---

## 12. PHASE 2 COMPLETION CRITERIA

✅ Phase 2 is complete when:
1. Listening Pass Service called on every upload (feature-flagged)
2. Output schema validated against v1.0
3. No regressions in existing flows
4. Feature flag can toggle on/off instantly
5. Dev logging shows raw JSON only (no UI changes)
6. All error cases handled gracefully

**Then:** Pause for testing + approval before Phase 3 (LLM hook-up)

---

## SUMMARY: PHASE 2 SCOPE

**In:**
- ✅ Service wiring
- ✅ Feature flag
- ✅ Dev-only logging

**Out:**
- ❌ LLM integration (Phase 3)
- ❌ Echo Report Card UI (Phase 4)
- ❌ Recommendation display (Phase 3+)

**Goal:**
Prove Listening Pass works in production context. Validate schema. Prepare for LLM hook-up.

**Risk:**
Minimal (feature-flagged, dev-only, non-blocking, fail-safe)

---

## READY FOR CODE IMPLEMENTATION

Once approved, implementation is straightforward:
1. Create `featureFlags.ts` (copy-paste)
2. Import in upload handler
3. Add ~15 lines to upload function
4. Test with feature flag ON/OFF
5. Verify schema compliance

Estimated implementation time: 30 minutes
Estimated testing time: 15 minutes

**Proceed to code when approved.**
