# Master Class Module - Sprint 1: Skeleton

**Version:** 1.0.0
**Date:** January 4, 2026
**Status:** PRODUCTION SKELETON (Implementations Pending)

---

## Overview

The Master Class Module is the flagship product pivot that transforms Echo Sound Lab from a "tool that could enable theft" to a "tool for tuition."

### Strategic Mission

Transform stem separation from an **audio extraction tool** into an **interactive music education platform**.

**User Journey:**
```
Upload Song → Select "Master Class" Mode → Learn to play the instruments → Export as lesson PDF
             (not "Extract Stems")       (not "Download isolated tracks")
```

---

## Architecture

### Module Structure

```
src/modules/master-class/
├── types.ts                    # Type definitions
├── index.ts                    # Module exports
├── engine/
│   ├── AcademyAudioEngine.ts   # Core processor (stem → lesson)
│   └── NoteTranscriptionService.ts  # Frequency → MIDI converter
├── ui/
│   ├── LessonView.tsx          # Split-screen lesson display
│   └── InstrumentToggle.tsx    # Focus button component
├── safety/
│   └── ExportRestriction.ts    # Policy-based export blocking
└── README.md (this file)
```

### Data Flow

```
1. Audio Input
   ↓
2. AcademyAudioEngine.processAudio()
   - Separate stems (VOCALS, DRUMS, BASS, OTHER)
   - Analyze each stem (pitch, intensity, spectral content)
   - Extract metadata (tempo, key, chords)
   ↓
3. Generate Visualizations
   - Waveform data
   - Piano roll (MIDI visualization)
   - Spectrogram (frequency domain)
   - Score/tablature
   ↓
4. Create LessonObject (NOT AudioBuffer)
   - Stems (for listening/focus mode only)
   - Visualizations
   - Learning paths
   - Export restrictions (enforced)
   ↓
5. Display in LessonView
   - Top: Waveform + playback controls
   - Bottom: Score + focus buttons + coaching tips
   ↓
6. Export Options (with restrictions)
   - ✅ PDF (lesson + sheet music + tips)
   - ❌ STEMS (blocked by semantic policy)
   - ❌ MIDI (reserved for future)
   - ❌ Audio (blocked by semantic policy)
```

---

## Sprint 1: Skeleton Implementation

### What's Implemented

#### ✅ Type System (`types.ts`)
- Complete TypeScript interfaces for all components
- LessonObject structure (output of AcademyAudioEngine)
- StemAnalysis, AudioMetadata, LessonVisualization
- Governance types (LessonRestrictions, ExportRequest)

#### ✅ Core Engine (`AcademyAudioEngine.ts`)
- Static class initialization with PolicyEngine integration
- Audio processing pipeline (skeleton)
- Mix state management for instrument focus
- Forensic logging for all operations
- Error handling with fail-safe defaults

#### ✅ Note Transcription (`NoteTranscriptionService.ts`)
- Frequency to MIDI/note conversion
- MIDI note numbering (0-127)
- Note sequencing with onset detection
- Duration classification (whole, half, quarter notes, etc.)
- Key signature detection
- Cents-based tuning analysis

#### ✅ UI Components
- `LessonView.tsx`: Split-screen lesson display with playback controls
- `InstrumentToggle.tsx`: Focus button component for stem isolation
- Both fully styled and interactive

#### ✅ Safety Policy (`ExportRestriction.ts`)
- ExportRestrictionManager with semantic policy enforcement
- Blocks STEMS and AUDIO_BUFFER exports (CRITICAL severity)
- Allows PDF exports (promotes learning)
- Data sanitization to prevent circumvention
- Forensic logging of all export attempts

#### ✅ Module Exports (`index.ts`)
- Centralized export point for all module functionality
- Factory function for convenient instantiation

### What's a Skeleton (Needs Implementation)

#### 🔧 Audio Processing Pipeline
In `AcademyAudioEngine.ts`:
- `separateStems()` - Currently returns silence (needs integration with stem separator)
- `analyzeStem()` - Currently returns empty analysis (needs pitch detection, spectral analysis)
- `extractAudioMetadata()` - Returns hardcoded defaults (needs tempo/key/chord detection)
- `generateVisualizations()` - Returns empty visualizations (needs rendering logic)
- `generateLearningPaths()` - Returns empty array (needs AI coaching system)

#### 🔧 Visualization Rendering
In `LessonView.tsx`:
- Waveform canvas - Shows placeholder (needs Web Audio API canvas rendering)
- Score canvas - Shows placeholder (needs music notation rendering library)
- Playback integration - Skipped audio playback logic

#### 🔧 Audio Playback
- No audio context connection to Web Audio API
- No gain control for mix adjustments
- No real-time playback synchronization

---

## How to Use (Sprint 1)

### Import the Module

```typescript
import { createMasterClassModule } from './modules/master-class';

const masterClass = createMasterClassModule();
```

### Initialize with Policy Engine

```typescript
import { PolicyEngine } from './action-authority/governance/semantic/PolicyEngine';
import { getDefaultPolicyConfig } from './action-authority/governance/semantic/defaultConfig';

// Must initialize PolicyEngine first
PolicyEngine.initialize(getDefaultPolicyConfig());

// Then initialize audio engine
masterClass.engine.initialize();
```

### Process Audio

```typescript
const result = await masterClass.engine.processAudio(
  audioBuffer,
  userId,
  'Song Title'
);

if (result.success) {
  // Display lesson
  console.log('Lesson created:', result.lessonObject);
} else {
  console.error('Processing failed:', result.error);
}
```

### Display Lesson

```typescript
import { LessonView } from './modules/master-class';

<LessonView
  lessonObject={result.lessonObject}
  onExportAttempted={(format) => console.log('Export attempt:', format)}
  onFocusChange={(instrument) => console.log('Focused:', instrument)}
  autoPlay={false}
  showCoachingTips={true}
/>
```

### Enforce Export Restrictions

```typescript
const { allowed, reason } = ExportRestrictionManager.checkExportAllowed({
  lessonId: 'lesson-123',
  userId: 'user-456',
  format: 'STEMS',
  timestamp: Date.now()
});

if (!allowed) {
  console.log('Export blocked:', reason);
}
```

---

## Integration Points

### 1. Action Authority / Semantic Policy

The Master Class module integrates with the existing Action Authority system via the PolicyEngine:

```typescript
// In AcademyAudioEngine.processAudio()
const policyResult = PolicyEngine.evaluate(governanceContext);
if (!policyResult.isValid) {
  return { success: false, error: policyResult.reason };
}
```

**Safety Gate:** Every lesson creation is checked against semantic policies.

### 2. Stem Separator

The AcademyAudioEngine wraps the stem separator:

```typescript
// TODO: Replace stub with actual stem separator
private async separateStems(audioBuffer, lessonId) {
  // return await stemSeparator.separate(audioBuffer);
}
```

### 3. Forensic Logging

All operations are logged for audit trail:

```typescript
this.logLessonCreation(lessonId, userId, songTitle, exportAttempted);
// Output: [AcademyAudioEngine:LESSON_CREATED] { ... }
```

---

## Sprint Roadmap

### ✅ Sprint 1: Skeleton (COMPLETED)
- Type system defined
- Core engine class structure
- UI component scaffolding
- Export restriction policy
- Module exports and factory

### 🔜 Sprint 2: Eyes (Synesthesia - Visualization)
- Integrate Web Audio API for waveform rendering
- Implement spectrogram visualization
- Render piano roll (MIDI visualization)
- Render sheet music/tablature
- Real-time playback with Web Audio API
- Instrument focus with gain controls

### 🔜 Sprint 3: Guardrails (Safety & Polish)
- Full export restriction policy enforcement
- Stem separation integration (actual processor)
- Pitch detection algorithm
- Chord detection algorithm
- AI coaching system (learning path generation)
- Performance optimization
- Production testing and hardening

---

## Type System Overview

### Core Types

```typescript
// Main output type
interface LessonObject {
  id: string;
  title: string;
  duration: number;
  audioMetadata: AudioMetadata;      // Key, tempo, chords
  stems: {                           // For listening only
    vocals: StemAnalysis;
    drums: StemAnalysis;
    bass: StemAnalysis;
    other: StemAnalysis;
  };
  visualizations: LessonVisualization; // Score, waveform, etc.
  learningPaths: LearningPath[];      // AI coaching
  restrictions: LessonRestrictions;   // Export enforcement
  metadata: { ... };
}

// Analyzed stem data
interface StemAnalysis {
  stemType: 'vocals' | 'drums' | 'bass' | 'other';
  frequency: number[];               // Frequency progression
  notes: Note[];                      // Transcribed notes
  midiData: MidiData[];              // MIDI representation
  intensity: number[];               // Amplitude envelope
  spectrogramData: SpectrogramFrame[]; // Frequency domain
}

// Export governance
interface LessonRestrictions {
  canExportStems: boolean;    // Always false
  canExportMidi: boolean;     // Future
  canExportPDF: boolean;      // Always true
  canFocusInstruments: boolean; // true (learning, not stealing)
  exportRestrictionReason: string;
}
```

---

## Safety Architecture

### Three-Layer Safety

1. **Policy Engine** (Action Authority)
   - Semantic policy evaluation at processing time
   - Blocks creation of lessons from restricted content

2. **UI Level** (LessonView)
   - Export buttons disabled based on restrictions
   - Warning messages for disabled features
   - Forensic logging of all user actions

3. **Data Level** (ExportRestrictionManager)
   - `sanitizeExportData()` removes stems even if UI bypassed
   - Policy-based validation of all export requests
   - Fail-safe: blocks on error

### The "Three Question" Gate

Every action is evaluated against:

1. **Does it deceive?** - Extracting stems pretending to be for learning
2. **Does it addict?** - Encouraging repeated piracy attempts
3. **Does it empower?** - Learning to play instruments, understanding music theory

Master Class mode answers:
- ✅ No deception - clearly labeled as learning platform
- ✅ No addiction - focused on skill development
- ✅ Yes empowerment - users learn music skills

---

## Performance Characteristics

### Sprint 1 (Skeleton)
- Minimal overhead - no actual audio processing
- Policy evaluation: <5ms per lesson
- Type safety: Full TypeScript coverage

### Sprint 2 (Expected)
- Audio processing: 2-5x audio duration
- Spectrogram generation: 1-2 seconds
- Piano roll rendering: 100-500ms depending on note count

### Sprint 3 (Optimized)
- Caching of analysis results
- Web Worker processing for heavy operations
- Incremental visualization updates

---

## Known Limitations

### Sprint 1 Skeleton Limitations

1. **No actual audio processing** - All analysis returns empty/default data
2. **No audio playback** - Web Audio API integration pending
3. **No visualization rendering** - Canvas elements show placeholders
4. **No AI coaching** - Learning paths not generated
5. **Hardcoded metadata** - Tempo, key, chords are defaults

### Design Trade-offs

1. **Rule-based export blocking** vs ML detection
   - ✅ Deterministic, auditable, tamper-proof
   - ⚠️ May have false negatives on sophisticated bypass attempts

2. **UI-level enforcement** + Policy-level enforcement
   - ✅ Defense in depth
   - ⚠️ May confuse users if UI button looks available but is blocked

3. **No MIDI export in Sprint 1**
   - ✅ Simplifies implementation, reduces piracy vectors
   - ⚠️ Limits music production use cases (reserved for future)

---

## Testing

### Unit Tests (To be created)

```bash
npm test -- master-class/AcademyAudioEngine.test.ts
npm test -- master-class/NoteTranscriptionService.test.ts
npm test -- master-class/ExportRestriction.test.ts
npm test -- master-class/LessonView.test.tsx
```

### Integration Tests (To be created)

```bash
npm test -- master-class/integration/end-to-end.test.ts
```

### Manual Testing Checklist

- [ ] Lesson created successfully from audio file
- [ ] Policy engine blocks restricted creation
- [ ] LessonView displays all sections
- [ ] Instrument focus buttons work
- [ ] Export PDF button works
- [ ] Export STEMS button is disabled
- [ ] Forensic logs show all operations
- [ ] No stem data leakage in memory

---

## Troubleshooting

### PolicyEngine Not Initialized

```
Error: [AcademyAudioEngine] PolicyEngine not initialized
```

**Fix:** Initialize PolicyEngine before AcademyAudioEngine:

```typescript
PolicyEngine.initialize(getDefaultPolicyConfig());
masterClass.engine.initialize();
```

### Export Restrictions Not Enforced

**Check:** Verify ExportRestrictionManager is called before exporting:

```typescript
const { allowed, reason } = ExportRestrictionManager.checkExportAllowed(request);
if (!allowed) return; // Block export
```

### Stem Analysis Empty

**Expected in Sprint 1:** `analyzeStem()` returns empty data until integrated with actual audio processor.

---

## Future Enhancements

### Sprint 2: Eyes (Synesthesia)
- [ ] Implement all visualization rendering
- [ ] Real-time playback with Web Audio API
- [ ] Waveform canvas with zoom/pan
- [ ] Piano roll with note highlighting
- [ ] Sheet music rendering

### Sprint 3: Guardrails
- [ ] Actual stem separation integration
- [ ] Pitch detection (Autocorrelation/PYIN algorithm)
- [ ] Chord detection (HPCP-based)
- [ ] Tempo detection (Onset detection + tempo fitting)
- [ ] AI coaching (LLM-based learning path generation)
- [ ] MIDI export (with restrictions)

### Future Versions
- [ ] Collaborative lessons (share progress with friends)
- [ ] Practice tracking (record improvements over time)
- [ ] Leaderboards (skill-based, not piracy-based)
- [ ] Premium features (MIDI export, advanced coaching)

---

## Contributing

When implementing skeletons:

1. **Keep stubs clearly marked** with `// TODO:` comments
2. **Maintain type safety** - no `any` types
3. **Log all operations** for forensic trail
4. **Respect export restrictions** - never bypass policy
5. **Write tests** as you implement
6. **Update this README** with implementation status

---

## Support

For questions about the Master Class module:

1. Check this README first
2. Review types.ts for data structures
3. Check AcademyAudioEngine for core flow
4. Review LessonView for UI behavior
5. Check ExportRestriction for safety logic

---

**Version:** 1.0.0
**Last Updated:** January 4, 2026
**Status:** SKELETON COMPLETE - Implementations Pending
**Next:** Sprint 2 - Synesthesia Visualization
