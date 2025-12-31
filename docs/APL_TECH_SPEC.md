# Audio Perception Layer (APL) - Technical Spec

**Purpose:** Define interfaces, data flow, lifecycle rules, and constraints for the Audio Perception Layer.
**Derived From:** `docs/APL_PHASE_IMPLEMENTATION_PLAN.md`

---

## 1. Scope and Constraints

**In Scope**
- Local, session-scoped perception of audio
- Read-only analysis from live playback, stems, or reference tracks
- Perceptual embeddings, change detection, and summary signals
- Evented outputs for consumers (UI, Self Session, plugins)

**Out of Scope**
- DSP automation or plugin control
- Model training or dataset capture
- Cloud inference or network calls
- Persistent storage without explicit export

**Non-Negotiables**
- APL must never modify audio buffers or processing chains.
- APL must not start automatically on load or mount.
- All failures are non-blocking to playback and UI.

---

## 2. Data Flow (Read-Only)

```
Audio Source (playback, stems, reference)
  -> Read-only Tap
    -> Feature Extraction (frames)
      -> Embedding Builder (rolling)
        -> Change Detector
          -> APL Event Bus
            -> Consumers (UI, Self Session, plugins)
```

**Notes**
- Audio Source is always read-only.
- No DSP nodes or offline rendering are created by APL.
- All outputs are advisory signals only.

---

## 3. Core Interfaces (TypeScript)

### 3.1 Config and Session

```typescript
export type APLState = 'idle' | 'listening' | 'paused' | 'closed';

export interface APLConfig {
  enabled: boolean;
  listenMode: 'playback' | 'analysis';
  frameMs: number; // e.g. 50
  embeddingWindowMs: number; // e.g. 2000
  maxMemoryMb: number; // e.g. 128
  devLogging: boolean;
}

export interface APLSession {
  id: string;
  state: APLState;
  config: APLConfig;
  start(input: APLInput): void;
  pause(): void;
  resume(): void;
  stop(): void;
  close(): void;
  getSnapshot(): APLSnapshot;
  on(event: APLEventType, handler: APLEventHandler): () => void;
}
```

### 3.2 Inputs and Outputs

```typescript
export interface APLInput {
  sourceId: string;
  sourceType: 'file' | 'bus' | 'live' | 'reference';
  sampleRate: number;
  channels: number;
  durationSec?: number;
}

export interface PerceptualFrame {
  timestampMs: number;
  brightness: number; // 0-1
  density: number; // 0-1
  dynamics: number; // 0-1
  stereoWidth: number; // 0-1
  transientEnergy: number; // 0-1
}

export interface PerceptualEmbedding {
  windowStartMs: number;
  windowEndMs: number;
  vector: number[]; // fixed length
  confidence: number; // 0-1
}

export interface APLChangeEvent {
  timestampMs: number;
  type: 'brighter' | 'darker' | 'denser' | 'sparser' | 'louder' | 'softer';
  magnitude: number; // 0-1
  confidence: number; // 0-1
}

export interface APLSnapshot {
  state: APLState;
  latestFrame?: PerceptualFrame;
  latestEmbedding?: PerceptualEmbedding;
  recentChanges: APLChangeEvent[];
}
```

### 3.3 Events

```typescript
export type APLEventType = 'frame' | 'embedding' | 'change' | 'state';

export type APLEventHandler = (payload: unknown) => void;
```

---

## 4. Lifecycle Rules

1. **Creation**
   - APLSession is created only on explicit user action:
     - Start listening
     - Start playback with APL enabled
     - Manual analysis trigger

2. **Start**
   - `start(input)` attaches a read-only tap to the audio source.
   - APL moves to `listening` state.

3. **Pause/Resume**
   - `pause()` stops frame emission but preserves session memory.
   - `resume()` continues frame emission from current source.

4. **Stop**
   - `stop()` detaches the audio tap and clears rolling embeddings.
   - APL moves to `idle` state.

5. **Close**
   - `close()` invalidates session memory and removes all listeners.
   - APL moves to `closed` state.

6. **Session Reset**
   - New session begins when a new source is loaded or user resets APL.
   - No cross-session memory is retained.

---

## 5. Performance and Memory Constraints

- Target response: sub-200ms from audio change to event emission.
- Frame window: 50ms to 100ms.
- Embedding window: 1s to 2s rolling average.
- CPU budget: less than 10 percent on a modern laptop.
- Memory cap: configurable, default 128 MB, hard stop at 256 MB.
- If the cap is reached, APL drops oldest memory first.

---

## 6. Safety and Integrity

- APL is read-only and cannot call DSP or processing APIs.
- APL cannot alter `originalBuffer` or `processedBuffer`.
- APL must never auto-start on file load or component mount.
- Any APL errors are logged (dev only) and do not block playback.

---

## 7. Compatibility Notes

- APL outputs are versioned for consumer stability.
- APL can reuse existing analysis utilities if they do not mutate audio.
- No UI integration is required until Phase 4.

---

## 8. Open Questions (For Follow-Up)

- Which perceptual dimensions are mandatory for v0 (brightness, density, dynamics, width, transient)?
- Where is the read-only tap exposed in the current audio engine?
- What is the minimal embedding size that still preserves perceptual stability?

