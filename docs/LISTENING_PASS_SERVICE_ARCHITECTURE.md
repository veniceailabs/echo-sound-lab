# Listening Pass Service Architecture (v0.1)

**Status:** Implementation Plan
**Purpose:** Production backend service for perceptual audio analysis
**Scope:** Tokens 1–3 (Fatigue, Intelligibility, Instability) with deterministic detection

---

## Design Principles

1. **Stateless:** No session state, memory, or learning. Same input → same output always.
2. **Deterministic:** All analysis logic is pure functions. Reproducible across runs.
3. **Non-invasive:** Read-only perception layer. No DSP actions, no audio modification.
4. **Schema-compliant:** Strictly follows `LISTENING_PASS_OUTPUT_SCHEMA.md` v1.0.
5. **Testable:** Clear input/output contracts, mockable dependencies.
6. **Safe for Friendly Mode:** All output grounded in detected signals only.

---

## Service Interface

### Input Contract

```typescript
interface ListeningPassInput {
  // Audio data
  audioBuffer: AudioBuffer | Float32Array;  // Raw PCM or Web Audio buffer
  sampleRate: number;                       // Samples per second (e.g., 44100, 48000)
  duration: number;                         // Duration in seconds

  // Optional metadata (for future extensibility)
  metadata?: {
    genre?: string;
    bpm?: number;
    targetLufs?: number;
    fileInfo?: string;
  };
}
```

### Output Contract

```typescript
interface ListeningPassOutput {
  mode: 'friendly' | 'advanced';
  listening_pass: {
    version: string;
    analysis_confidence: number;
    tokens: Token[];
    priority_summary: PrioritySummary;
  };
  // Metadata for debugging/audit
  _analysis: {
    start_ms: number;
    end_ms: number;
    duration_s: number;
    windows_analyzed: number;
  };
}
```

---

## Token Detection Logic (v0.1)

### Token #1: FATIGUE_EVENT (Listener Fatigue)

**Detection windows:** 2-second overlapping windows (50% overlap)
**Primary band:** 2–6 kHz (upper-mid frequency range)

**Algorithm:**
1. Extract 2-second window of audio
2. Compute RMS in 2–6 kHz band for each window
3. Extract sharp transients (high-frequency impulses)
4. Count transients per window (threshold: > 8 transients = escalating)
5. Compute recovery time (silence duration after transient burst)
6. Score accumulation: `low_recovery + high_count = escalating fatigue`

**Output:**
- `detected: true` if transient_count > 8 AND recovery_time < 0.8s in 50%+ of windows
- `severity: low | moderate | high | critical` based on transient density
- `confidence: 0.0–1.0` based on consistency across windows
- `trend: isolated | recurring | escalating | resolving | stable`

### Token #2: INTELLIGIBILITY_LOSS (Intelligibility Collapse)

**Detection windows:** 1-second windows (no overlap, faster response)
**Primary bands:** Lead frequency range (80–8000 Hz) vs interference (spectral overlap)

**Algorithm:**
1. Extract 1-second window
2. Detect lead presence (consonants, vowel formants)
3. Compute spectral occupancy in overlap zones (consonant regions)
4. If overlap coefficient > 0.6 during consonant-active moments → interference
5. Lead confidence: ratio of time consonants are clear vs masked

**Output:**
- `detected: true` if overlap > 0.6 AND consonant clarity < 0.7 in 50%+ of windows
- `severity: low | moderate | high | critical` based on clarity loss
- `confidence: 0.0–1.0` reduced to 0.7 if lead confidence uncertain
- `trend: isolated | recurring | escalating | resolving | stable`

### Token #3: INSTABILITY_EVENT (Instability/Anxiety)

**Detection windows:** 0.5-second windows (75% overlap, highest temporal resolution)
**Analysis:** Transient spacing variance + learnability

**Algorithm:**
1. Extract 0.5-second window
2. Detect all transient onsets (attack points)
3. Compute spacing (time between onsets)
4. Calculate variance in spacing
5. **Pattern Learnability Test:** If variance is high BUT spacing repeats with > 70% consistency → intentional (suppress)
6. If variance is high AND non-repeating → nervous instability

**Output:**
- `detected: true` if spacing_variance > threshold AND pattern_repeatability < 70%
- `severity: low | moderate | high | critical` based on variance
- `confidence: 0.0–1.0` based on consistency of nervousness across windows
- `suppressed: true` if pattern_repeatability > 70% (intentional aesthetic)
- `trend: isolated | recurring | escalating | resolving | stable`

---

## Processing Pipeline

```
AudioBuffer
    ↓
[Window slicing: 2s, 1s, 0.5s]
    ↓
[Parallel token detection]
    ├─ Token 1: FATIGUE_EVENT
    ├─ Token 2: INTELLIGIBILITY_LOSS
    └─ Token 3: INSTABILITY_EVENT
    ↓
[Priority resolution]
    ├─ Stage assignment
    ├─ Dominant token selection
    ├─ Conflict resolution
    └─ Suppression filtering
    ↓
[Schema serialization]
    ↓
ListeningPassOutput (JSON)
```

---

## Key Implementation Details

### Window Management

```typescript
interface WindowAnalysis {
  windowIndex: number;
  startSec: number;
  endSec: number;
  fatigue: TokenAnalysis;
  intelligibility: TokenAnalysis;
  instability: TokenAnalysis;
}

// Fatigue: 2-second windows with 50% overlap
// Intelligibility: 1-second windows, no overlap
// Instability: 0.5-second windows with 75% overlap
```

### Frequency Analysis

- Use FFT (Fast Fourier Transform) for spectral analysis
- Window function: Hann (reduces spectral leakage)
- Bin resolution: Depends on window size (longer window = better frequency resolution)
- Bands:
  - Low: 0–250 Hz
  - Low-Mid: 250–1000 Hz
  - Mid: 1000–2000 Hz
  - High-Mid (Fatigue zone): 2000–6000 Hz
  - High: 6000–16000 Hz

### Transient Detection

```typescript
// Pseudo-code for transient detection
function detectTransients(window: Float32Array, threshold: number): number {
  const highPass = applyHighPassFilter(window, 2000); // Isolate high frequencies
  const envelope = computeEnvelope(highPass);
  const onsets = findOnsets(envelope, threshold);
  return onsets.length;
}
```

### Suppression Logic (Token 3)

```typescript
function shouldSuppressInstability(spacing: number[], variance: number): boolean {
  // Pattern learnability test
  const repeatability = computePatternRepeatability(spacing);

  // If pattern is learnable (repeats consistently), suppress
  return repeatability > 0.7;
}
```

---

## Performance Characteristics

### Computation Cost

| Token | Windows | Cost per Window | Total Time |
|-------|---------|-----------------|-----------|
| Fatigue | ~15 (2s, 50% overlap) | 5ms | 75ms |
| Intelligibility | ~30 (1s, no overlap) | 3ms | 90ms |
| Instability | ~60 (0.5s, 75% overlap) | 2ms | 120ms |
| **Total** | - | - | **~285ms** |

**For a 3-minute track (180 seconds):** ~285ms processing time

### Memory Usage

- FFT buffer: ~16KB per window
- Intermediate results: ~100KB
- Output JSON: ~50KB
- **Total:** ~200KB per analysis

### Scaling Notes

**v0.1 (Current):** Single-threaded, synchronous, no caching
**v0.2 (Future):** Web Workers for parallel token analysis
**v1.0 (Future):** Streaming analysis, real-time updates

---

## Integration Points

### Frontend → Listening Pass

```typescript
// Frontend requests analysis
const result = await listeningPassService.analyzeAudio(audioBuffer, sampleRate);
```

### Listening Pass → LLM Reasoning

```typescript
// LLM consumes schema-compliant output
const recommendations = await geminiPrompt.generate(result.listening_pass);
```

### Friendly vs Advanced Mode

```typescript
// Mode gates visibility, not truth
const userRecommendations = advancedMode
  ? recommendations.all_tokens
  : recommendations.stage_1_only;
```

---

## Testing Strategy

### Unit Tests

1. **Token detection correctness:** Test each token against synthetic signals
2. **Window management:** Verify window slicing produces expected overlaps
3. **Frequency analysis:** Validate FFT against known signals (sine waves, sweeps)
4. **Suppression logic:** Verify Pattern Learnability Test catches intentional rhythms

### Integration Tests

1. **End-to-end:** Real audio → output schema compliance
2. **Test case inputs:** All 5 test cases produce expected JSON structures
3. **Confidence gating:** Verify 0.6 threshold excludes low-confidence tokens
4. **Priority resolution:** Multi-token conflicts resolve correctly

### Validation Tests

1. **Schema compliance:** All outputs pass `LISTENING_PASS_OUTPUT_SCHEMA.md` v1.0
2. **Determinism:** Same input always produces identical output
3. **Tone preservation:** Friendly Mode language respected in LLM integration

---

## Files to Create

1. **`listening_pass_service.ts`** — Main service implementation
2. **`listening_pass_analysis.ts`** — Token detection algorithms
3. **`listening_pass_types.ts`** — TypeScript interfaces for schema
4. **`listening_pass_service.test.ts`** — Unit + integration tests
5. **`listening_pass_examples.json`** — Example outputs for 5 test cases

---

## Next Steps

1. Implement `listening_pass_service.ts` with function signatures
2. Implement token detection algorithms (v0.1 with placeholders for v1.0 optimization)
3. Create example outputs for all 5 test cases
4. Document performance characteristics
5. Wire into existing audio pipeline (non-blocking, read-only)
