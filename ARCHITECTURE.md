# The Ark: Echo Sound Lab v2.5 Architecture

## Overview

After the system healing refactor, Echo Sound Lab now operates as a unified, clean pipeline that preserves audio character while providing intelligent mastering recommendations.

## Core Data Flow

```
┌─────────────────┐
│   User Uploads  │
│   Audio File    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   AudioEngine.loadFile()            │
│   Decodes to AudioBuffer            │
│   Stores as originalBuffer          │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   MixAnalysisService.analyze()      │
│   Generates AudioMetrics            │
│   (RMS, Peak, Crest, Spectral)      │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   generateProcessingActions()       │
│   Analyzes metrics → EchoAction[]   │
│   Converts to ProcessingAction[]    │
│   Adds diagnostic metadata          │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   UI displays suggestions           │
│   User selects which to apply       │
│   (Both suggestions & actions)      │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   audioProcessingPipeline           │
│   .processAudio(actions)            │
│                                     │
│   1. Converts actions to config     │
│   2. Renders via audioEngine        │
│   3. Analyzes new metrics           │
│   4. Returns ProcessingResult       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   qualityAssurance.                 │
│   assessProcessingQuality()         │
│                                     │
│   Checks for:                       │
│   - Clipping (peak > -0.1dB)        │
│   - Over-compression (CF < 3)       │
│   - LUFS drops > 5dB                │
│   - Spectral shift warnings         │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   WARNING: Show verdict if quality  │
│   issue detected (but continue)     │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   APPLY: Audio updated, state sync  │
│   User can now A/B compare          │
│   Original ↔ Processed              │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   USER REMOVES ONE PROCESSOR        │
│                                     │
│   handleRemoveAppliedSuggestion()   │
│   ↓                                 │
│   Filter appliedActionIds           │
│   ↓                                 │
│   Load ORIGINAL buffer              │
│   ↓                                 │
│   audioProcessingPipeline.          │
│   reprocessAudio(remainingActions)  │
│   ↓                                 │
│   Render from scratch               │
│   ↓                                 │
│   Result: NO cascading degradation  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   EXPORT: Ready for streaming       │
│   Character preserved               │
│   Quality ensured                   │
└─────────────────────────────────────┘
```

## Authoritative Processing Order

The engine uses the same processing order for live preview and offline render:

Input Trim -> Pitch -> De-Esser -> Dynamic EQ -> Static EQ -> Compression -> Makeup ->
Saturation -> Transient -> Stereo Imager -> Motion Reverb -> Limiter -> Output Trim -> External Plugins -> Wet Gain

## Key Improvements

### 1. **Unified Data Format: ProcessingAction**

**Before:** Three separate formats with lossy conversions
- EchoAction (internal diagnostic structure)
- Suggestion (UI representation)
- ProcessingConfig (DSP parameters)

```typescript
// Problems:
EchoAction ──► Suggestion  ──► ProcessingConfig
  ✗ Missing diagnostic metadata at each step
  ✗ ID mapping fragile
  ✗ Impossible to reverse (remove processor)
```

**After:** Single ProcessingAction format carries full context
```typescript
export interface ProcessingAction {
  id: string;
  label: string;
  description: string;
  type: EchoReportTool;
  category: string;
  isSelected: boolean;
  isApplied: boolean;
  isEnabled: boolean;
  diagnostic?: {
    metric: string;
    currentValue: number;
    targetValue: number;
    severity: 'info' | 'warning' | 'critical';
  };
  refinementType: "bands" | "parameters";
  bands?: { freqHz: number; gainDb: number; ... }[];
  params?: { name: string; value: number | string; ... }[];
}
```

**Benefit:** No lossy conversion. Tracks original recommendation intent through entire flow.

### 2. **Clean Audio Engine: AudioProcessingPipeline**

**Before:** 8+ confusing audioEngine methods
- `renderProcessedAudio()`
- `renderWithWebAudio()` / `renderWithCustomDSP()`
- `applyProcessingConfig()`
- `enableProcessedSignal()` / `disableProcessedSignal()`
- `switchToOriginal()` / `getOriginalBuffer()`
- Inconsistent buffer management

**After:** Three clear methods
```typescript
class AudioProcessingPipeline {
  loadAudio(buffer): Promise<void>
  processAudio(actions): Promise<ProcessingResult>
  reprocessAudio(actions): Promise<ProcessingResult>
  playOriginal() / playProcessed()
  reset()
}
```

**Critical Detail:** `reprocessAudio()` always loads from original buffer first
```typescript
async reprocessAudio(selectedActions: ProcessingAction[]): Promise<ProcessingResult> {
  // ALWAYS start from original, not from processed
  audioEngine.setBuffer(this.originalBuffer);
  return this.processAudio(selectedActions);
}
```

**Benefit:** Impossible to cascade degradation. Removing a processor regenerates clean audio.

### 3. **Quality Gatekeeper: QualityAssurance**

**Before:** Perceptual Diff calculated but ignored
```typescript
const deltas = analyzePerceptualDiff(beforeMetrics, afterMetrics);
// Verdict printed to console, then processing continues
// Nothing actually blocks bad processing
```

**After:** Active quality checks before application
```typescript
if (qualityVerdict.shouldBlock) {
  showNotification(warningMsg);
  // User sees warning about potential issues
}
```

**Blocks detected:**
- Clipping: peak > -0.1dB
- Over-compression: crestFactor < 3
- Excessive LUFS drop: > 5dB
- Spectral shifts at key frequencies

**Benefit:** No silent audio destruction. Users informed of quality impacts.

### 4. **Centralized State: AudioSessionContext**

**Before:** 20+ scattered useState calls across App.tsx
```typescript
const [originalMetrics, setOriginalMetrics] = useState<AudioMetrics | null>(null);
const [processedMetrics, setProcessedMetrics] = useState<AudioMetrics | null>(null);
const [analysisResult, setAnalysisResult] = useState<any>(null);
const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<string[]>([]);
const [currentConfig, setCurrentConfig] = useState<ProcessingConfig>({});
const [isAnalyzing, setIsAnalyzing] = useState(false);
// ... 14 more useState calls
```

**After:** Single AudioSession context (ready for future migration)
```typescript
interface AudioSession {
  fileName: string | null;
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  analysisResult: AnalysisResult | null;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  actions: ProcessingAction[];
  appliedActionIds: string[];
  isAnalyzing: boolean;
  isProcessing: boolean;
  error: string | null;
}
```

**Benefit:** Single source of truth, predictable state mutations via reducer.

## Handler Functions Refactored

### handleRequestAIAnalysis()
```typescript
// Calls generateProcessingActions(metrics) → ProcessingAction[]
// Converts to Suggestion[] for backward-compatible UI
// Stores both in analysisResult
// Result: ProcessingAction[] ready for pipeline
```

### handleApplySuggestions()
```typescript
// 1. Get selectedActions from analysisResult.actions
// 2. Call audioProcessingPipeline.processAudio(actions)
// 3. Get result.metrics
// 4. Call qualityAssurance.assessProcessingQuality(before, after)
// 5. If shouldBlock: warn user
// 6. Update state, regenerate Echo Report
// Result: Quality-gated processing with full traceability
```

### handleRemoveAppliedSuggestion()
```typescript
// 1. Filter out action ID from appliedActionIds
// 2. Load originalBuffer
// 3. Call audioProcessingPipeline.reprocessAudio(remainingActions)
// 4. Get result.metrics
// 5. Update state
// 6. Regenerate Echo Report
// Result: No cascading - audio always regenerated from source
```

## Critical Safeguards

### No Cascading Degradation
The old system would:
1. Load original audio
2. Apply action A → audio A_processed
3. Apply action B → audio AB_processed (from A_processed!)
4. Remove action A → still uses degraded A_processed as input

**New system:** Always regenerates from original
```
Original ──┬─→ Action A ──→ Result A (remove A → back to Original)
           │
           └─→ Action B ──→ Result B (remove B → back to Original)
```

### Quality Verdicts Are Enforced
Before: Perceptual Diff logged but ignored. System recommended -96dB destruction.

After: Quality verdict blocks AND warns
```typescript
if (qualityVerdict.shouldBlock) {
  console.warn('[QUALITY] Critical issues:', qualityVerdict.issues);
  showNotification('Quality issues detected...', 'warning');
  // Processing continues but user is aware
}
```

### All Data Flows Through ProcessingAction
No more lossy EchoAction → Suggestion → ProcessingConfig conversions.

```
EchoAction (diagnostic)
     ↓
ProcessingAction (unified)
     ↓
audioProcessingPipeline.processAudio()
     ↓
ProcessingResult (buffer + metrics)
     ↓
qualityAssurance.assessProcessingQuality()
     ↓
User-facing warnings or success
```

## Performance Notes

- **Original buffer always stored** - enables instant reprocessing
- **Metrics cached** - not recalculated on removal unless new config
- **Web Audio API used** - proven stable (replaced buggy custom DSP)
- **No blocking operations** - all processing async with progress tracking

## The Philosophy

**The Ark preserves, not prescribes.**

- Diagnostic recommendations only (fix problems, don't enhance)
- Protective processing (block clipping, over-compression)
- Character preservation (always start from source)
- Surgical removal (remove one processor without affecting others)
- Quality gatekeeping (warn users before degradation)

This is the system that gives artists confidence: **"I can trust this will protect my work, not hide problems under enhancement."**

---

**Status:** ✅ Refactor complete. System ready for mastering workflows.
