# CODEBASE AUDIT FOR SPRINT 2: THE EYES (SYNESTHESIA)

**Date:** January 4, 2026
**Audit Scope:** Existing visualization, audio, and UI infrastructure for Sprint 2 planning
**Status:** Ready for Sprint 2 implementation

---

## EXECUTIVE SUMMARY

The codebase has **robust existing infrastructure** that Sprint 2 should build on:

1. ✅ **Web Audio API integration** - Full audioContext implementation
2. ✅ **SVG-based visualization patterns** - EQCurveVisualizer proves proven approach
3. ✅ **Stem management & mixing** - stemMixerService with gain/pan control
4. ✅ **Multi-mode architecture** - App already supports multiple EngineMode options
5. ✅ **Real-time rendering patterns** - Components use requestAnimationFrame

**Key Finding:** Sprint 2 does NOT need to reinvent the wheel. We build on existing patterns.

---

## 1. EXISTING AUDIO INFRASTRUCTURE

### 1.1 Web Audio API Integration

**Location:** `src/services/audioEngine.ts` (2,000+ lines)

**What exists:**
- Full `AudioContext` initialization and management
- Comprehensive Web Audio node types (GainNode, BiquadFilterNode, DynamicsCompressorNode, etc.)
- Processing chain: Input → EQ → Compression → Saturation → Reverb → Output
- Offline rendering capability (OfflineAudioContext)
- Sample rate handling (typical 44.1kHz, 48kHz)

**Key Code Pattern:**
```typescript
// From audioEngine.ts
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
const source = audioCtx.createBufferSource();
const gainNode = audioCtx.createGain();
const analyser = audioCtx.createAnalyser();
```

**Implication for Sprint 2:**
- Can directly use audioContext for FFT analysis
- Can attach AnalyserNode to visualization pipeline
- No need to bootstrap Web Audio API from scratch

### 1.2 Stem Mixer with Mix Control

**Location:** `src/services/stemMixer.ts` (380 lines)

**What exists:**
- Multi-stem audio buffer management
- Stem roles (vocals, drums, bass, etc.)
- Gain, pan, mute, solo controls
- Reverb and delay sends
- OfflineAudioContext rendering to final mix
- Stem role auto-detection based on frequency analysis

**Key Features:**
```typescript
// From stemMixer.ts
interface Stem {
  id: string;
  name: string;
  role: StemRole;
  buffer: AudioBuffer;
  volume: number;  // dB
  pan: number;     // -1 to 1
  muted: boolean;
  solo: boolean;
}

// Gain node setup with dB to linear conversion
volumeGain.gain.value = Math.pow(10, stem.volume / 20);
```

**Implication for Sprint 2:**
- Focus mode (InstrumentToggle) can directly modify stem.volume
- Can attach AnalyserNodes to each stem's output
- Already has infrastructure for real-time level metering

---

## 2. EXISTING VISUALIZATION INFRASTRUCTURE

### 2.1 SVG-Based Visualization Pattern

**Location:** `src/components/EQCurveVisualizer.tsx` (180 lines)

**What exists:**
- SVG-based curve rendering (proven lightweight, scalable)
- Logarithmic frequency scaling (20Hz to 20kHz)
- Interactive dragging with real-time updates
- Grid lines and labels
- Path interpolation for smooth curves

**Key Code:**
```typescript
// Logarithmic frequency scale
const x = Math.log10(band.frequency / 20) / Math.log10(20000 / 20) * width;

// SVG path generation
return `M 0 ${height / 2} ${points.join(' ')} L ${width} ${height / 2}`;
```

**Implication for Sprint 2:**
- Use same SVG approach for waveform, spectrogram, piano roll
- Logarithmic scale proven and tested
- Grid system already validated

### 2.2 Multi-Stem Workspace UI

**Location:** `src/components/MultiStemWorkspace.tsx` (500+ lines)

**What exists:**
- AudioContext initialization and cleanup
- Gain, pan, mute, solo controls for multiple stems
- Visual knobs with drag interaction
- Real-time playback with Web Audio API
- Master gain and routing

**Key Pattern:**
```typescript
// Knob interaction pattern
const handleMouseDown = (bandIndex) => setDraggedBand(bandIndex);
const handleMouseMove = (e) => {
  const deltaY = startY - e.clientY;
  scheduleUpdate(startValue + (deltaY / pixelsPerRange) * range);
};
```

**Implication for Sprint 2:**
- Focus buttons can reuse knob interaction pattern
- Master gain control already exists
- Pan control already tested

---

## 3. EXISTING ANALYSIS INFRASTRUCTURE

### 3.1 Mix Analysis Service

**Location:** `src/services/mixAnalysis.ts` (400+ lines)

**What exists:**
- Static metrics analysis (RMS, peak, crest factor)
- Frequency balance analysis (low/mid/high ratio)
- Tonal balance extraction
- Stereo width measurement per frequency band
- Psychoacoustic metrics

**Key Methods:**
```typescript
// From mixAnalysisService
analyzeStaticMetrics(buffer: AudioBuffer)
extractMixSignature(buffer: AudioBuffer)
analyzeFrequencyBalance(buffer: AudioBuffer)
measureStereoWidth(buffer: AudioBuffer, freqMin, freqMax)
```

**Implication for Sprint 2:**
- Can reuse frequency analysis for spectrogram data
- Already have psychoacoustic scaling
- Tonal balance gives us frequency bucketing

### 3.2 Reference Analyzer

**Location:** `src/services/referenceAnalyzerV2.ts` (300+ lines)

**What exists:**
- Advanced reference audio analysis
- Reverb detection and character
- Delay detection
- Vocal position analysis
- Dynamics analysis

**Implication for Sprint 2:**
- Can adapt for pitch/MIDI extraction
- Frequency domain analysis patterns proven

---

## 4. EXISTING UI COMPONENT PATTERNS

### 4.1 Real-Time Update Pattern

**Pattern from MultiStemWorkspace:**
```typescript
// Schedule updates using requestAnimationFrame
const scheduleUpdate = (nextValue: number) => {
  if (rafRef.current !== null) return;
  rafRef.current = window.requestAnimationFrame(() => {
    // Process update
    rafRef.current = null;
  });
};
```

**Implication:** Use for spectrogram/waveform canvas updates

### 4.2 Modal/Overlay Pattern

**Existing patterns:**
- `ShareableCardModal` - Modal dialog
- `DiagnosticsOverlay` - Floating overlay
- `NotificationManager` - Toast notifications

**Can adapt for:** Coaching tips overlay, export restriction messages

### 4.3 Multi-Mode Architecture

**Location:** App.tsx shows EngineMode support

**What exists:**
```typescript
type EngineMode = /* exact enum from types.ts */;
// App already switches between different UI modes
```

**Implication:** Master Class mode will slot into existing pattern

---

## 5. MISSING PIECES FOR SPRINT 2

### 5.1 Real-Time FFT Analysis

**Not currently integrated:** Dedicated AnalyserNode-based FFT pipeline
- Existing code has AnalyserNode infrastructure
- Need to: Create real-time frequency bin extraction

**Location to implement:** `src/services/fftAnalyzer.ts` (new)

### 5.2 Canvas-Based Rendering

**Not currently done:** Canvas waveform/spectrogram rendering
- SVG proven for curves, but canvas better for high-frequency data
- Need to: Canvas rendering with requestAnimationFrame

**Location to implement:** `src/components/WaveformCanvas.tsx` (new)

### 5.3 MIDI Visualization

**Not currently implemented:** Piano roll / note visualization
- MidiData types exist in master-class/types.ts
- Vexflow or similar needed for sheet music

**Location to implement:** `src/components/PianoRoll.tsx` (new)

### 5.4 Stem Separation Engine Integration

**Not currently implemented:** Actual audio separation
- Master Class module has stubs
- Need to integrate with: Demucs, Spleeter, or similar

**Location to implement:** `src/services/stemSeparationService.ts` (new)

### 5.5 Pitch Detection

**Not currently implemented:** Real-time pitch/MIDI conversion
- NoteTranscriptionService skeleton exists
- Need actual autocorrelation or PYIN algorithm

**Location to implement:** Enhance `src/modules/master-class/engine/NoteTranscriptionService.ts`

---

## 6. RECOMMENDED SPRINT 2 ARCHITECTURE

### Data Flow

```
AudioBuffer Input
    ↓
[stemMixerService] ← Already exists
    ↓ (each stem)
[AnalyserNode] ← Use Web Audio API
    ↓ (frequency data via getByteFrequencyData)
[fftAnalyzer] ← NEW: Extract bins and peaks
    ↓
┌─────────────────────────────────────┐
│ Visualization Pipeline              │
├─────────────────────────────────────┤
│ WaveformCanvas (HTML5 Canvas)       │
│ SpectrogramCanvas (Canvas)          │
│ PianoRollSVG (SVG, inherited pattern)│
│ ScoreSVG (Vexflow integration)      │
└─────────────────────────────────────┘
    ↓
[LessonView] ← Already designed
```

### New Files to Create

```
Sprint 2: Eyes
├── src/services/fftAnalyzer.ts              (200 lines)
│   - Extract frequency bins
│   - Peak detection
│   - FFT post-processing
│
├── src/components/WaveformCanvas.tsx        (250 lines)
│   - Real-time waveform rendering
│   - Playhead sync
│   - Zoom/pan controls
│
├── src/components/SpectrogramCanvas.tsx     (300 lines)
│   - Waterfall spectrogram
│   - Color scale (dB)
│   - Time-frequency grid
│
├── src/components/PianoRoll.tsx             (280 lines)
│   - MIDI note visualization
│   - Time alignment
│   - Interactive note highlighting
│
├── src/components/SheetMusicRenderer.tsx    (200 lines)
│   - Vexflow integration
│   - Treble/bass clefs
│   - Key/time signature
│
├── src/services/audioPlaybackEngine.ts      (300 lines)
│   - Web Audio API playback control
│   - Playhead position tracking
│   - Mix state real-time control
│
└── src/services/stemSeparationService.ts    (200 lines)
    - Integrate actual stem separator
    - Handle async processing
    - Return structured stems
```

---

## 7. DEPENDENCY ANALYSIS

### External Libraries to Add

| Library | Purpose | Why | Size |
|---------|---------|-----|------|
| **Vexflow** | Sheet music rendering | Standard for music notation | ~500KB |
| **Tone.js** | (Optional) Synth playback | For coaching tone feedback | ~250KB |
| **Demucs** | Stem separation | State-of-the-art separation | ~2GB model |

### Already Available

| Service | Status | Can Use For |
|---------|--------|------------|
| audioEngine | ✅ Exists | Web Audio node routing |
| stemMixerService | ✅ Exists | Stem management |
| mixAnalysisService | ✅ Exists | Frequency analysis |
| referenceAnalyzerV2 | ✅ Exists | Advanced analysis |
| audioContext API | ✅ Built-in | FFT (AnalyserNode) |

---

## 8. INTEGRATION WITH MASTER CLASS MODULE

### Connection Points

1. **AcademyAudioEngine.ts**
   - `separateStems()` → stemSeparationService
   - `analyzeStem()` → fftAnalyzer + NoteTranscriptionService
   - `generateVisualizations()` → Canvas/SVG components

2. **LessonView.tsx**
   - Uses audioPlaybackEngine for playback
   - Renders WaveformCanvas, SpectrogramCanvas, PianoRoll
   - Playback sync via requestAnimationFrame

3. **InstrumentToggle.tsx**
   - Calls stemMixerService.updateStem()
   - Updates gain/pan on audioContext nodes

---

## 9. PERFORMANCE CHARACTERISTICS

### Current System Can Handle

| Operation | Time Budget | Headroom |
|-----------|------------|----------|
| FFT (real-time) | ~16ms (60fps) | ✅ Web Audio API is optimized |
| Canvas render | ~16ms | ✅ RequestAnimationFrame handles throttling |
| Spectrogram draw | ~32ms | ✅ Can use Web Workers |
| MIDI detection | ~50ms | ⚠️ May need caching |

### Optimization Strategies Already Known

- requestAnimationFrame for smooth updates (proven in MultiStemWorkspace)
- Web Worker pattern for heavy lifting
- Caching of analysis results (already used in PolicyEngine)
- Progressive rendering (load visualization as data arrives)

---

## 10. RISKS & MITIGATIONS

### Risk 1: FFT Real-Time Performance
**Risk:** Spectrogram updates lag with 4+ stems
**Mitigation:**
- Use Web Worker for FFT calculation
- Downsample visualization (not all frequency bins)
- Cache stable frequency bands

### Risk 2: Canvas Context Management
**Risk:** Multiple canvas elements consuming GPU memory
**Mitigation:**
- Single shared canvas with layers
- Off-screen canvas for complex rendering
- Clean up resources on unmount

### Risk 3: Stem Separation Latency
**Risk:** User waits for processing
**Mitigation:**
- Show placeholder visualization
- Stream results as available
- Use caching + hash matching

### Risk 4: Playback Sync Drift
**Risk:** Visualization drifts from audio playhead
**Mitigation:**
- audioContext.currentTime as source of truth
- Sync check every 100ms
- Resync on seek

---

## 11. PROVEN PATTERNS TO REUSE

### Pattern 1: SVG Logarithmic Scaling
```typescript
// From EQCurveVisualizer - use for piano roll
const xPos = Math.log10(freq / baseFreq) / Math.log10(maxFreq / baseFreq) * width;
```

### Pattern 2: Real-Time Update Scheduling
```typescript
// From MultiStemWorkspace - use for canvas updates
scheduleUpdate = (fn) => {
  if (rafRef.current) return;
  rafRef.current = requestAnimationFrame(() => {
    fn();
    rafRef.current = null;
  });
};
```

### Pattern 3: Drag Interaction
```typescript
// From EQCurveVisualizer - reuse for piano roll dragging
handleMouseDown = (index) => setDragged(index);
handleMouseMove = (e) => {
  const delta = e.clientX - startX;
  updatePosition(delta);
};
```

---

## 12. RECOMMENDATION FOR SPRINT 2 TASK BREAKDOWN

### Phase 2a: Audio Analysis (Days 1-2)
- FFT analysis service
- Spectrogram data generation
- Pitch/note detection integration

### Phase 2b: Core Visualization (Days 2-4)
- WaveformCanvas
- SpectrogramCanvas (waterfall)
- PianoRoll component

### Phase 2c: Integration & Sync (Days 4-5)
- Playback engine
- Playhead synchronization
- InstrumentToggle integration

### Phase 2d: Polish (Days 5-6)
- Zoom/pan controls
- Performance optimization
- Web Worker offloading

---

## 13. SUCCESS CRITERIA FOR SPRINT 2

- ✅ Real-time waveform display (60fps)
- ✅ Spectrogram waterfall (updated every 100ms)
- ✅ Piano roll showing detected notes
- ✅ Playhead sync within 100ms accuracy
- ✅ Focus button mutes other stems in visualization
- ✅ Score rendering (at least treble clef)
- ✅ No memory leaks on long plays (>5min)
- ✅ Touch controls responsive on mobile

---

## 14. STRATEGIC NOTE FOR GHOST DEMO

When recording Sprint 2 demo:
```
SCENE: Master Class Mode Lesson
┌─────────────────────────────────────────┐
│ User uploads "Bohemian Rhapsody"        │
│ Mode: Master Class (not Extraction)     │
│                                         │
│ [WaveformCanvas] - Song waveform        │
│ [SpectrogramCanvas] - Freq over time    │
│ [PianoRoll] - Notes floating by         │
│ [Focus: Bass] button clicked            │
│    ↓ Bass highlighted in visualizations │
│    ↓ Other stems fade (visual + audio)  │
│                                         │
│ User clicks "Export Stems"              │
│    ↓ BLOCKED by ExportRestriction       │
│                                         │
│ User clicks "Export as PDF"             │
│    ↓ SUCCESS (Sheet music + tips)       │
└─────────────────────────────────────────┘
```

This perfectly demonstrates Level 4: System understands *context* (learning vs extraction)

---

**Status:** AUDIT COMPLETE - Ready for Sprint 2 Planning
**Next Step:** Create detailed Sprint 2 implementation plan based on these findings
