# Echo Sound Lab — Application Architecture Analysis

**Date:** 2025-12-28
**Status:** READY FOR INTEGRATION PLANNING
**Scope:** Codebase structure, Self Session attachment points, Phase 2 recommendations

---

## 1. Application Overview

**Framework:** React 19 + TypeScript + Vite
**Styling:** Tailwind CSS + PostCSS
**Audio Engine:** Web Audio API + Web Audio Modules (WAM)
**AI Integration:** Google Gemini API
**Build Target:** Browser-based (localhost:3003)

**Purpose:** Professional audio analysis, mastering assistance, and creative workflow enhancement.

---

## 2. Current Architecture Layers

### 2.1 Presentation Layer (`/src/components`)

**44 Component Files** organized by responsibility:

**Core UI Components:**
- `App.tsx` - Main application container
- `ChatInterface.tsx` - AI conversation interface
- `ProcessingPanel.tsx` - DSP parameter control
- `AnalysisPanel.tsx` - Audio metrics visualization
- `EnhancedControlPanel.tsx` - Transport & playback controls

**Specialized Workspace Components:**
- `MultiStemWorkspace.tsx` - Multi-track editing
- `AIStudio.tsx` - Generative AI features
- `VideoEngine.tsx` - Video + audio sync
- `WAMPluginRack.tsx` - Web Audio Modules plugin host
- `LocalPluginRack.tsx` - Local plugin hosting

**EQ & Metering:**
- `ParametricEQPanel.tsx` - Parametric equalizer UI
- `ChannelEQPanel.tsx` - Per-channel EQ
- `AdvancedMeters.tsx` - Phase, stereo, LUFS meters
- `EQCurveVisualizer.tsx` - EQ response visualization

**Analysis & Reports:**
- `EchoReportPanel.tsx` - AI-generated analysis report
- `ListeningPassCard.tsx` - Session summaries
- `ShareableCardModal.tsx` - Social sharing
- `HistoryTimeline.tsx` - Session history view

**Settings & Diagnostics:**
- `SettingsPanel.tsx` - User preferences
- `DiagnosticsOverlay.tsx` - Debug information
- `SSCOverlay.tsx` - Subsystem status (NEW)
- `ProcessingOverlay.tsx` - Real-time processing status
- `NotificationCenter.tsx` - Toast notifications

**Status:** All components use React hooks, managed by AudioSessionContext

---

### 2.2 Service Layer (`/src/services`)

**42 Service Files** implementing domain logic:

**Core Audio Processing:**
- `audioEngine.ts` - Low-level Web Audio API interface
- `audioProcessingPipeline.ts` - Unified processing abstraction
- `mixAnalysis.ts` - Audio metric calculation
- `customDsp.ts` - DSP algorithm implementations
- `advancedDsp.ts` - Complex signal processing

**Processing Intelligence:**
- `masteringAnalyzer.ts` - Automatic mastering recommendations
- `audioProcessingPipeline.ts` - Action → Config transformation
- `processingActionUtils.ts` - Action composition
- `autoMastering.ts` - Mastering chain generation

**Analysis & Matching:**
- `referenceAnalyzerV2.ts` - Reference track analysis
- `referenceMatching.ts` - Mix matching to reference
- `listeningPassService.ts` - Listening pass creation
- `qualityAssurance.ts` - QA verdict calculation

**AI Features:**
- `geminiService.ts` - Google Gemini API wrapper
- `reasonAboutListeningPass.ts` - AI analysis reasoning
- `venumEngine.ts` - V.E.N.U.M. social sharing
- `sunoApiService.ts` - Suno API integration (music gen)

**Session & State:**
- `sessionManager.ts` - Autosave + session restore (5s interval)
- `historyManager.ts` - Revision history tracking
- `storageService.ts` - LocalStorage abstraction

**Media & Encoding:**
- `batchProcessor.ts` - Batch processing queue
- `encoderService.ts` - Audio encoding (MP3, WAV)
- `voiceApiService.ts` - Voice API (Suno)

**Plugin Systems:**
- `wamPluginService.ts` - Web Audio Modules hosting
- `localPluginService.ts` - Native plugin wrapping
- `fxMatchingEngine.ts` - Effect matching heuristics

**Specialized:**
- `genreProfiles.ts` - Genre-specific presets
- `presetManager.ts` - Preset CRUD
- `i18nService.ts` - Internationalization
- `fullStudioSuite.ts` - Studio asset loading

**Status:** Services are stateless/singleton patterns, no explicit lifecycle

---

### 2.3 State Management (`/src/context`, `/src/services`)

**Current Approach:** Mixed React hooks + context + services

**AudioSessionContext:**
```typescript
// /src/context/AudioSessionContext.tsx
interface AudioSessionState {
  // Audio buffers
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;

  // Playback state
  isPlaying: boolean;
  currentPlayheadSeconds: number;

  // Analysis results
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;

  // Processing config
  currentConfig: ProcessingConfig | null;
  appliedActions: ProcessingAction[];
}
```

**SessionManager:**
- Autosaves every 5 seconds
- Tracks: fileName, config, playhead, revisions
- Restores on app reload
- No lifecycle hooks for external events

**Status:** No explicit authority/permission layer currently exists

---

### 2.4 Types & Data Models (`/src/types.ts`)

**Core Types (~500 lines):**

```typescript
enum AppState {
  IDLE, LOADING, READY, PROCESSING, ERROR, COMPLETE
}

enum EngineMode {
  FRIENDLY,    // Simplified UI
  ADVANCED     // Full parameter access
}

interface ProcessingConfig {
  // Gain/dynamics
  gains: GainConfig;
  dynamics: DynamicsConfig;

  // Equalization
  eq: EQSettings;
  dynamicEq: DynamicEQConfig;

  // Spatial
  midSideConfig?: MidSideConfig;
  stereoWidth?: number;

  // Effects
  reverb?: ReverbConfig;
  compression?: CompressorConfig;
  // ... 12 more effect types
}

interface ProcessingAction {
  id: string;
  type: string;  // 'eq_adjustment', 'compress', 'reverb', etc.
  reversibility: 'Fully' | 'Partial' | 'Non-Reversible';
  parameters: Record<string, number>;
  description: string;
}

interface AudioMetrics {
  rms: number;
  peak: number;
  crestFactor: number;
  spectralCentroid: number;
  spectralRolloff: number;
  lufs?: LUFSMetrics;
  advancedMetrics?: AdvancedAudioMetrics;
}
```

**Status:** Types are comprehensive but lack authority/permission annotations

---

## 3. Self Session Integration Points

### 3.1 Where Self Session Attaches (Frontend)

**Integration Layer:** Between user interaction and service execution

```
User Interface
      ↓
Event Handler (e.g., onClick, onChange)
      ↓
[SELF SESSION CHECKPOINT]  ← Authorization check
      ↓
Service Layer (audioEngine, sessionManager, etc.)
      ↓
Business Logic Execution
      ↓
State Update & Audit Log
```

**Specific Attachment Points:**

#### A. ProcessingPanel Component
- **Current:** User drags EQ slider → `onChange` → updates state → audio re-renders
- **With Self Session:** User action → Self Session evaluates capability (PARAMETER_ADJUSTMENT) → checks authority → allows/halts → optionally triggers ACC
- **Capability Required:** `PARAMETER_ADJUSTMENT`
- **Side-Effect Risk:** Some parameters enable auto-save (Rule C3)

#### B. Transport Controls (play, pause, stop)
- **Current:** User clicks play → sets `isPlaying` state
- **With Self Session:** User clicks → Self Session evaluates (TRANSPORT_CONTROL) → simple low-risk action
- **Capability Required:** `TRANSPORT_CONTROL`
- **Side-Effect Risk:** None

#### C. File Operations (open, save, export)
- **Current:** User selects file → `fileInput.onChange` → loads via audioEngine
- **With Self Session:** User action → Self Session evaluates (FILE_READ or FILE_WRITE) → requires pre-ACC for writes
- **Capability Required:** `FILE_READ`, `FILE_WRITE`
- **Side-Effect Risk:** Saving could trigger auto-backups (Rule C3)

#### D. AI Features (Gemini reasoning, recommendations)
- **Current:** User clicks "Analyze" → service makes API call → displays result
- **With Self Session:** User action → Self Session evaluates → may trigger ACC if irreversible
- **Capability Required:** Depends on action (text input? parameter adjustment?)
- **Side-Effect Risk:** May create files (reports, exports)

#### E. Settings Changes
- **Current:** User toggles preference → updates localStorage
- **With Self Session:** User action → Self Session evaluates (could be side-effect) → Rule C3 applies
- **Capability Required:** PARAMETER_ADJUSTMENT (with side-effect promotion)
- **Side-Effect Risk:** HIGH - e.g., "auto-save enabled" requires FILE_WRITE ACC

#### F. Export/Render Operations
- **Current:** User clicks "Export" → batchProcessor queues job → renders in background
- **With Self Session:** User action → Self Session evaluates (RENDER_EXPORT) → requires explicit pre-ACC → monitors completion
- **Capability Required:** `RENDER_EXPORT`
- **Side-Effect Risk:** HIGHEST - irreversible, background execution

---

### 3.2 Integration Points in Service Layer

#### A. `audioProcessingPipeline.ts`
- **Integration Point:** `processAudio()` method
- **Current:** Takes `ProcessingAction[]` → renders → returns `ProcessingResult`
- **With Self Session:** Add pre-execution guard check → verify each action against capability registry
- **Binding:** Each action execution requires passing execution guard (7 preconditions)

#### B. `sessionManager.ts`
- **Integration Point:** `updateSession()` method
- **Current:** Updates session state every 5 seconds (autosave)
- **With Self Session:** Autosave must respect authority → cannot save if not FILE_WRITE capable
- **Binding:** Autosave pauses during S4 (ACC_CHECKPOINT) and S5 (PAUSED) states

#### C. `batchProcessor.ts`
- **Integration Point:** `enqueueJob()` and `processQueue()` methods
- **Current:** Batches render jobs, executes in background
- **With Self Session:** Batch operations require Rule C4 (Single-Action ACC Binding) → each export needs separate approval
- **Binding:** Cannot silently process batch without per-action ACCs

#### D. `audioEngine.ts`
- **Integration Point:** `renderProcessedAudio()` method
- **Current:** Renders to new AudioBuffer
- **With Self Session:** Rendering operations should log to audit trail
- **Binding:** Optional logging for reversible operations (PARAMETER_ADJUSTMENT) → mandatory for irreversible (RENDER_EXPORT)

---

### 3.3 State Machine Attachment

**Application State Lifecycle:**

```
ESL State Flow                Self Session State Flow
─────────────────             ──────────────────────

IDLE
  ↓
[FILE LOADED]  ←─────────────→  S0_INACTIVE
  ↓
[PROCESSING]   ←─────────────→  S3_EXECUTING (if authorized)
  ↓
[RENDERING]    ←─────────────→  S4_ACC_CHECKPOINT (before render)
  ↓                              ↓
[COMPLETE]     ←─────────────→  S3_EXECUTING (approval given)
                                 ↓
                              [RENDER COMPLETES]
                                 ↓
                              S5_PAUSED (auto-pause after completion)
                                 ↓
                              [ARTIST ACK] → S3 or S6
```

**Synchronization Points:**
1. Session starts → Self Session enters S1
2. User grants capabilities → Self Session enters S2, registry locked
3. User begins work → Self Session enters S3, processing allowed
4. Silence detected → Self Session enters S4, autosave pauses
5. Session ends → Self Session enters S6, all authority revoked

---

## 4. Current Capability Mapping (ESL → Self Session)

### Capability: UI_NAVIGATION
**ESL Examples:**
- Clicking menu buttons
- Scrolling panel content
- Focusing UI regions

**Self Session:** Low-risk, allowed

---

### Capability: TEXT_INPUT
**ESL Examples:**
- Typing search queries
- Entering preset names
- Voice input (transcription)

**Self Session:** Medium-risk, allowed with context

---

### Capability: PARAMETER_ADJUSTMENT
**ESL Examples:**
- EQ slider adjustment (frequency, gain, Q)
- Compression ratio/threshold/attack
- Reverb time/depth adjustments
- Engine mode switching

**Self Session:** Medium-risk, **BUT** requires Rule C3 side-effect detection

**Side-Effect Examples:**
- Toggling "auto-save" → requires FILE_WRITE ACC
- Enabling "background rendering" → requires RENDER_EXPORT ACC
- Changing "session directory" → requires FILE_WRITE ACC

---

### Capability: TRANSPORT_CONTROL
**ESL Examples:**
- Play / Pause buttons
- Stop button
- Scrub/seek to position
- Loop toggle

**Self Session:** Low-risk, fully reversible

---

### Capability: FILE_READ
**ESL Examples:**
- Opening audio file
- Loading preset
- Importing reference track
- Reading cached session

**Self Session:** Medium-risk, safe (read-only)

---

### Capability: FILE_WRITE
**ESL Examples:**
- Saving session
- Exporting audio (WAV, MP3)
- Writing preset
- Creating backup

**Self Session:** HIGH-risk, requires per-action ACC

**Rule C4 Enforcement:**
```
User approves: "Save session"
  ↓
Self Session creates single write operation
  ↓
Session saved to disk
  ↓
[Another save needed?] → Requires NEW ACC (cannot reuse)
```

---

### Capability: RENDER_EXPORT
**ESL Examples:**
- Bounce to audio file
- Export mastered mix
- Render preview
- Generate analysis report

**Self Session:** HIGHEST-risk, irreversible, requires:
1. Pre-execution ACC (explicit confirmation)
2. Post-execution monitoring (background job tracking)
3. Per-action binding (Rule C4)

**Rule C7 Enforcement:**
```
[User initiates render]
  ↓
Self Session issues ACC → user confirms
  ↓
Render begins (background)
  ↓
[Render completes]
  ↓
Session auto-transitions to S5 (PAUSED)
  ↓
User must explicitly approve resumption or halt
```

---

## 5. Phase 2 Requirements: OS-Level Permission Model

**Objective:** Map Self Session capabilities to macOS Accessibility/Automation APIs

### 5.1 macOS API Mapping

**Self Session Capability** → **macOS Permission Model** → **User Prompt**

#### UI_NAVIGATION
- **macOS API:** Accessibility API (AXUIElement)
- **Permission:** `NSAccessibilityUsageDescriptionKey` (Info.plist)
- **User Prompt:** "Echo Sound Lab needs accessibility access to navigate windows"
- **Scope:** Read-only UI inspection, click/focus operations
- **Enforcement:** Cannot click outside declared window bounds

#### TEXT_INPUT
- **macOS API:** Accessibility API + Keyboard Events
- **Permission:** `NSAccessibilityUsageDescriptionKey`
- **User Prompt:** "Echo Sound Lab needs to type in text fields"
- **Scope:** Character input only, no command sequences
- **Enforcement:** Validation prevents command injection, shell sequences

#### PARAMETER_ADJUSTMENT
- **macOS API:** Direct app automation (via declared capabilities)
- **Permission:** App-internal permission registry (no OS prompt)
- **User Prompt:** None (granted in-app by artist)
- **Scope:** Slider/control interaction within app window
- **Enforcement:** Bounds checking, parameter validation

#### TRANSPORT_CONTROL
- **macOS API:** Direct app method calls
- **Permission:** App-internal (no OS prompt)
- **User Prompt:** None (granted in-app by artist)
- **Scope:** Play/pause/stop only, no file operations
- **Enforcement:** Single-threaded, no background continuation

#### FILE_READ
- **macOS API:** File sandbox + file picker dialog
- **Permission:** Automatic (macOS sandboxing)
- **User Prompt:** Standard "Open File" dialog
- **Scope:** Artist-selected files only
- **Enforcement:** Session can only read files explicitly opened

#### FILE_WRITE
- **macOS API:** File sandbox + explicit file paths
- **Permission:** `NSDocumentsFolderUsageDescriptionKey` (Info.plist)
- **User Prompt:** "Echo Sound Lab needs permission to save files"
- **Scope:** Declared working directory only
- **Enforcement:** Per-action ACC binding (Rule C4), no batch writes

#### RENDER_EXPORT
- **macOS API:** Background task execution via app delegates
- **Permission:** `NSLocalNetworkUsageDescriptionKey` (if network rendering)
- **User Prompt:** "Echo Sound Lab needs to render audio in background"
- **Scope:** Background thread only, monitored for completion
- **Enforcement:** Session halts if app exits during render (Rule C6)

---

### 5.2 Permission Request Flow (Phase 2 Implementation)

```
[User initiates Self Session]
  ↓
[Capability negotiation]
  ↓
For each capability:
  - Check if macOS permission granted
  - If not, show user prompt
  - If denied, remove capability from registry
  ↓
[Registry locked]
  ↓
[Session begins with declared capabilities only]
  ↓
[On capability violation]
  → Automatic transition to S6 (HALTED)
  → Log violation to audit trail
```

---

### 5.3 Denial Gracefully Handling

**Example: Artist denies FILE_WRITE permission**

```
Self Session initialization:
  - FILE_READ: ✓ Granted
  - PARAMETER_ADJUSTMENT: ✓ Granted
  - TRANSPORT_CONTROL: ✓ Granted
  - FILE_WRITE: ✗ DENIED
  - RENDER_EXPORT: ✗ DENIED (requires FILE_WRITE)

Registry locked with: {FILE_READ, PARAMETER_ADJUSTMENT, TRANSPORT_CONTROL}

Behavior:
  - Artist can open files, adjust parameters, play/pause
  - Artist cannot save or export
  - If save attempted → automatic ACC shows with explanation
  - Session halts if save capability required
```

---

## 6. Frontend Integration Checklist

### 6.1 React Component Changes

- [ ] Add `useAuthorityCheck()` hook to processing components
- [ ] Wrap event handlers with `withSelfSessionGuard()` HOC
- [ ] Add ACC modal component for confirmation requests
- [ ] Integrate notification system with authority state
- [ ] Add audit log viewer to diagnostics overlay
- [ ] Update SessionContext to track authority state

### 6.2 Service Layer Changes

- [ ] Create `selfSessionService.ts` facade
- [ ] Add execution guard validation to `audioProcessingPipeline.ts`
- [ ] Implement side-effect detection in PARAMETER_ADJUSTMENT
- [ ] Add per-action ACC binding to `batchProcessor.ts`
- [ ] Modify `sessionManager.ts` to respect authority during autosave
- [ ] Create audit log persistence layer

### 6.3 Type System Changes

- [ ] Add `AuthorityLevel` type annotations to ProcessingAction
- [ ] Add `CapabilityRequired` field to ProcessingConfig
- [ ] Add `AuditLogEntry` interface
- [ ] Add `ConfirmationToken` interface
- [ ] Create union type for `SelfSessionState`

### 6.4 Testing Changes

- [ ] Unit tests for execution guard (7 preconditions)
- [ ] Integration tests for ACC flow
- [ ] Regression tests for existing functionality
- [ ] Performance tests (guard overhead < 5ms)

---

## 7. Non-Blocking Observations

### 7.1 Autosave Interaction
- Current: Every 5 seconds, unconditional
- Issue: Could create side-effects during processing
- Recommendation: Pause autosave during S4 (ACC_CHECKPOINT) and S5 (PAUSED)

### 7.2 Multi-Tab Behavior
- Current: Single-tab design (localStorage key = `echo-session-v2`)
- Issue: Multiple tabs could violate Rule C6 (Process Identity Binding)
- Recommendation: Detect tab focus loss, trigger ACC checkpoint or pause

### 7.3 Background Rendering
- Current: `batchProcessor.ts` queues jobs asynchronously
- Issue: Jobs could complete after session ends, violating session TTL
- Recommendation: Implement job cancellation on session halt (S6)

### 7.4 Voice Input (Suno)
- Current: `voiceApiService.ts` integrates voice generation
- Issue: Generated content is non-reversible (RENDER_EXPORT)
- Recommendation: Flag as high-risk, require pre-ACC

---

## 8. Recommended Implementation Order (Phase 2)

### Step 1: OS Permission Model (Week 1)
- Map Self Session capabilities to macOS APIs
- Implement permission request flow
- Test denial gracefully handling

### Step 2: Frontend Authority Hooks (Week 2)
- Create `useAuthorityCheck()` hook
- Wrap critical event handlers
- Add ACC modal component

### Step 3: Service Layer Integration (Week 2-3)
- Add execution guard to `audioProcessingPipeline.ts`
- Implement side-effect detection
- Add audit logging

### Step 4: Testing & Validation (Week 3)
- Unit test execution guard
- Integration test ACC flow
- Regression test existing features
- Performance profiling

### Step 5: UI Enhancements (Week 4)
- Audit log viewer
- Authority state indicators
- Capability registry visualization

---

## 9. Risk Assessment

### 9.1 Low Risk
- TRANSPORT_CONTROL implementation (play/pause)
- FILE_READ implementation (open files)
- UI_NAVIGATION (click handling)

### 9.2 Medium Risk
- TEXT_INPUT validation (injection prevention)
- PARAMETER_ADJUSTMENT side-effect detection
- ACC modal UX (clarity, no fatigue)

### 9.3 High Risk
- FILE_WRITE per-action binding (batch write prevention)
- RENDER_EXPORT background monitoring (job lifecycle)
- Process ID binding (app crash detection)
- Session halting (all state cleanup)

---

## 10. Success Criteria

- [ ] All 10 acceptance tests (AT-SS-01 through AT-SS-10) pass with ESL integration
- [ ] Zero capability boundary violations in audit log
- [ ] ACC response time < 200ms
- [ ] No background execution after session halt
- [ ] Autosave respects authority state
- [ ] Ghost's 6 constitutional rules (C1-C7) unviolated

---

## 11. Questions for Ghost

1. Is the macOS API mapping sufficient for Phase 2?
2. Should Process ID binding check process name as well (to catch app resignation)?
3. For multi-user systems: Should user identity be part of session binding?
4. Should failed capability checks log to system audit log (macOS) in addition to Self Session audit log?
5. For background render jobs: Should TTL be extended if render completes before session end?

---

**Next:** Ready for Phase 2 implementation authorization.

---

Generated with Claude Code
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
