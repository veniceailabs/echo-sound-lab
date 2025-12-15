# Suno-Style AI Music Generation Integration
## Echo Sound Lab v2.4

## Objective
Implement AI music generation system that **leapfrogs Suno's capabilities** by combining voice cloning, professional mastering, and reference track FX matching.

## User Requirements
- **Primary Workflow:** Full AI Generation → Professional Mastering Pipeline
- **Key Differentiators:**
  1. Reference track FX matching for AI vocals (unique to Echo Sound Lab)
  2. Hybrid vocal stacking (user vocals + AI harmonies)
- **Backend:** Suno API (third-party provider ~$0.01/song, we cover costs)
- **Rate Limiting:** 10 generations per user per day

## Competitive Advantages Already Built
✅ Native voice cloning (AI Studio with 3-step wizard)
✅ Professional mastering tools + Echo Report 99 Club scoring
✅ FX matching engine (reverb/delay/EQ/compression extraction)
✅ Multi-stem workspace with free stem separation
✅ Non-destructive workflow with history

## Implementation Phases

### Phase 1: Core Generation (MVP) - HIGH PRIORITY

#### 1.1 Create Suno API Service
**File:** `/src/services/sunoApiService.ts` (NEW - ~400 lines)

**Key Methods:**
```typescript
class SunoApiService {
  generateSong(request: {prompt, lyrics, style, voiceModelId}): Promise<SunoResponse>
  pollGenerationStatus(songId): Promise<SunoResponse>
  downloadSong(url): Promise<AudioBuffer>
  extractStems(songId): Promise<{vocals, instrumental}>
  checkRateLimit(): {allowed, remaining, resetAt}
  incrementUsage(): void
}
```

**Features:**
- Third-party Suno API integration (Replicate/RunPod)
- Rate limiting: 10/day per user (localStorage, reset at midnight UTC)
- Caching: Hash `prompt+style+voiceModelId`, TTL 7 days
- Error handling: Exponential backoff, user-friendly messages
- Cost tracking: Log each generation for monitoring

#### 1.2 Create Song Generation Wizard
**File:** `/src/components/SongGenerationWizard.tsx` (NEW - ~700 lines)

**5-Step Flow:**
1. **Voice Model Selection** - Display from `voiceEngineService.getVoiceModels()`
2. **Lyrics & Style Input** - Textarea + dropdown (Hip-Hop, R&B, Pop, Electronic, Rock)
3. **Reference Track (Optional)** - Upload → `fxMatchingEngine.matchReference()` → show FX detected
4. **Hybrid Vocals (Optional)** - Record with `useRecorder` → generate harmonies/doubles
5. **Generate & Preview** - Progress polling (every 2s) → preview player → "Route to Workspace" button

**UI:** Second Light OS styling (`glassCard`, `glowButton`, etc.)

#### 1.3 Replace Placeholder in Voice Engine
**File:** `/src/services/voiceEngineService.ts` (MODIFY lines 67-117)

Replace `createHyperRealisticVocals()` placeholder with:
```typescript
async generateSong(voiceModel, lyrics, style, options?) {
  // 1. Call Suno API
  const response = await sunoApiService.generateSong({...})

  // 2. Poll until complete
  while (status.status !== 'completed') { await poll... }

  // 3. Download and extract stems
  const buffer = await sunoApiService.downloadSong(status.audioUrl)
  const stems = await sunoApiService.extractStems(status.songId)

  // 4. Apply FX matching if reference provided
  if (options?.referenceTrack) {
    const fxMatch = await fxMatchingEngine.matchReference(options.referenceTrack)
    stems.vocals = await audioEngine.renderProcessedAudio(fxMatch.suggestedConfig)
  }

  // 5. Mix with user vocals if provided
  if (options?.userVocals) {
    stems.vocals = await this.mixUserWithAI(userBuffer, stems.vocals, options.generateHarmonies)
  }

  return {id, name, buffer, stems, metadata}
}
```

#### 1.4 Update AI Studio Component
**File:** `/src/components/AIStudio.tsx` (MODIFY lines 10, 36-44)

**Changes:**
- View state: `'library' | 'training'` → `'library' | 'training' | 'generate'`
- Add "Generate Song" button to VoiceModelLibrary header
- Add credit badge: "8/10 remaining today"
- Render SongGenerationWizard when `view === 'generate'`

### Phase 2: Professional Mastering Pipeline

#### 2.1 Auto-Route to Multi-Stem Workspace
**File:** `/src/App.tsx` (ADD around line 730)

```typescript
const loadGeneratedStems = async (generatedSong: GeneratedSong) => {
  const stemList: Stem[] = [
    {id: 'ai-vocals', name: 'AI Vocals', type: 'vocals', buffer: generatedSong.stems.vocals, ...},
    {id: 'instrumental', name: 'Instrumental', type: 'other', buffer: generatedSong.stems.instrumental, ...}
  ]

  setActiveMode('MULTI')
  // Load stems into MultiStemWorkspace

  // Auto-generate Echo Report
  const mixBuffer = await audioEngine.mixStems(stemList)
  await handleGenerateEchoReport(audioEngine.analyzeStaticMetrics(mixBuffer))
}
```

#### 2.2 Genre-Aware Mastering Presets
**File:** `/src/services/voiceEngineService.ts` or new `/src/services/masteringPresets.ts`

Auto-apply genre presets:
- **Hip-Hop:** Heavy compression (4:1), sub-bass boost (+2dB @ 60Hz), presence (+3dB @ 3kHz), de-esser
- **R&B:** Moderate compression (3:1), warmth (+1.5dB @ 80Hz), air shelf (+2.5dB @ 12kHz), reverb (15% mix, 2.5s decay)
- **Pop/Electronic:** Bright (+2dB @ 10kHz), tight compression, stereo width

### Phase 3: Reference Track FX Matching (DIFFERENTIATOR #1)

#### 3.1 Add Convenience Method
**File:** `/src/services/fxMatchingEngine.ts` (ADD around line 628)

```typescript
async applyToAIVocals(aiVocalBuffer, referenceBuffer): Promise<AudioBuffer> {
  const fxMatch = await this.matchFXToTarget(referenceBuffer, aiVocalBuffer)
  return await audioEngine.renderProcessedAudio(fxMatch.suggestedConfig)
}
```

#### 3.2 Display FX Explanation
**Component:** Inline in SongGenerationWizard Step 3

Show analysis:
- Confidence score (e.g., 87%)
- Reverb type, decay time, wet/dry ratio
- Delay type, timing, feedback
- Vocal EQ (presence boost, air shelf)
- Compression (ratio, threshold)
- Genre-aware adjustments

**Example:** "Applied Drake-style processing: slapback delay (80ms), +3dB presence boost @ 3kHz, minimal reverb (15% wet), 4:1 compression"

### Phase 4: Hybrid Vocal Stacking (DIFFERENTIATOR #2)

#### 4.1 Record User Vocals
**Component:** SongGenerationWizard Step 4

Use existing `useRecorder` hook:
```typescript
const { startRecording, stopRecording, audioBlob, audioUrl } = useRecorder()
```

#### 4.2 Generate AI Harmonies
**File:** `/src/services/sunoApiService.ts` (ADD method)

```typescript
async generateHarmonies(userVocalsBlob, voiceModelId, type: 'harmonies' | 'doubles'): Promise<AudioBuffer> {
  const base64 = await this.blobToBase64(userVocalsBlob)
  const response = await fetch(`${this.baseUrl}/harmonies`, {
    method: 'POST',
    body: JSON.stringify({vocals: base64, voiceModelId, type})
  })
  // Poll until complete...
  return await this.downloadSong(status.audioUrl)
}
```

#### 4.3 Professional Stem Mixing
**File:** `/src/services/voiceEngineService.ts` (ADD method)

```typescript
async mixUserWithAI(userVocals, aiHarmonies, instrumental): Promise<Stem[]> {
  return [
    {id: 'user-lead', name: 'Your Lead', buffer: userVocals, config: {volumeDb: 0, eq: [...]}},
    {id: 'ai-harmonies', name: 'AI Harmonies', buffer: aiHarmonies, config: {volumeDb: -4, reverb: {...}}},
    {id: 'instrumental', name: 'Instrumental', buffer: instrumental, config: {volumeDb: -6}}
  ]
}
```

### Phase 5: Cost Optimization

#### 5.1 Rate Limiting
**File:** `/src/services/sunoApiService.ts`

LocalStorage state:
```typescript
interface RateLimitState {
  date: string // YYYY-MM-DD
  count: number
  limit: number // 10
}

checkRateLimit() {
  const today = new Date().toISOString().split('T')[0]
  if (state.date !== today) { resetRateLimit() }
  return {allowed: remaining > 0, remaining, resetAt: nextMidnight}
}
```

#### 5.2 Generation Caching
**File:** `/src/services/sunoApiService.ts`

```typescript
private hashRequest(request): string {
  // Hash: prompt + style + voiceModelId
  // Store in localStorage with 7-day TTL
}
```

### Phase 6: UI/UX Polish

#### 6.1 Real-Time Progress
**Component:** GenerationProgressOverlay

- Animated waveform icon
- Progress bar (0-100%)
- Elapsed time / Estimated time (30-60s)
- Status: "Queued → Processing → Rendering → Complete"

#### 6.2 Credit Badge
**Component:** Inline in AIStudio header

```typescript
const CreditBadge = () => {
  const { remaining } = sunoApiService.checkRateLimit()
  return <div className={remaining > 5 ? 'bg-green-500/20' : 'bg-amber-500/20'}>
    {remaining} generation{remaining !== 1 ? 's' : ''} remaining
  </div>
}
```

#### 6.3 Error Handling
- Rate limit exceeded: "Daily limit reached. Resets at midnight."
- Network failure: "Connection failed. Check your internet."
- API timeout: "Generation timed out. Try again."
- Invalid voice model: "Please select a voice model."

## Critical Files

### New Files (3)
1. `/src/services/sunoApiService.ts` (~400 lines) - Core API integration
2. `/src/components/SongGenerationWizard.tsx` (~700 lines) - Main UI wizard
3. `/src/types.ts` (ADD interfaces) - SunoGenerationRequest, SunoResponse, GeneratedSong

### Modified Files (3)
1. `/src/services/voiceEngineService.ts` (lines 67-117) - Replace placeholder
2. `/src/components/AIStudio.tsx` (lines 10, 36-44) - Add "generate" view
3. `/src/App.tsx` (around line 730) - Route to multi-stem workspace

### Enhanced Files (1)
1. `/src/services/fxMatchingEngine.ts` (line 628) - Add `applyToAIVocals()` method

## Environment Setup

### Required Environment Variables
```env
VITE_SUNO_API_KEY=your_api_key_here
VITE_SUNO_API_URL=https://api.suno-provider.com/v1
VITE_RATE_LIMIT_PER_DAY=10
```

### API Provider Setup
1. Research: Replicate vs RunPod vs direct Suno partner
2. Sign up for API access
3. Generate API key
4. Configure rate limits and cost alerts

## User Flows

### Primary Flow
```
AI Studio (Library)
  → Click "Generate Song"
  → Select Voice Model
  → Enter Lyrics + Style
  → [Optional] Upload Reference Track
  → [Optional] Record User Vocals
  → Generate (30-60s)
  → Preview
  → Route to Multi-Stem Workspace
  → Auto-apply mastering + Echo Report
  → Export MP3/WAV
```

### Reference FX Matching Flow
```
Upload Reference (Drake song)
  → fxMatchingEngine.matchReference()
  → Display: "Slapback delay (80ms), +3dB presence boost..."
  → Generate AI Vocals
  → Auto-apply matched FX
  → Preview
  → Route to Workspace
```

### Hybrid Vocal Stacking Flow
```
Record User Vocals (useRecorder)
  → Submit to Suno API + Voice Model
  → Generate Harmonies/Doubles
  → Mix Stems: [User Lead (0dB), AI Harmonies (-4dB), Instrumental (-6dB)]
  → MultiStemWorkspace with individual controls
  → Professional mastering
  → Export
```

## Timeline Estimate
**Total: 10-12 days**
- Phase 1 (Core): 3-4 days
- Phase 2 (Mastering): 1-2 days
- Phase 3 (FX Matching): 1 day
- Phase 4 (Hybrid Vocals): 2 days
- Phase 5 (Cost Optimization): 1 day
- Phase 6 (UI/UX): 2 days

## Success Criteria
✅ Users can generate songs with their cloned voice
✅ Reference track FX matching works with 80%+ confidence
✅ Hybrid vocal stacking produces professional-quality mixes
✅ Echo Report scores AI-generated content accurately
✅ Rate limiting prevents cost overruns
✅ Generation time < 60 seconds average
✅ UI provides clear feedback at every step

## Competitive Advantages vs Suno
1. **True Voice Cloning** - Already built vs Suno's voice upload
2. **Professional Mastering** - Automatic genre presets + 99 Club scoring
3. **Reference Track FX Matching** - "Make my AI vocals sound like Drake" (UNIQUE)
4. **Hybrid Workflow** - Mix user vocals with AI harmonies (UNIQUE)
5. **Free Stem Workspace** - No credit charges for stem separation
6. **Non-Destructive** - Full history + jump-to-entry functionality

## Next Steps
1. Confirm Suno API provider and get API key
2. Implement Phase 1 (Core Generation) starting with `sunoApiService.ts`
3. User testing for wizard flow validation
4. Gradual rollout with cost monitoring dashboard
5. Iterate based on user feedback

---

**Sources:**
- [Suno AI Features 2025](https://www.audiocipher.com/post/suno-ai-chirp)
- [Suno V5 API Guide](https://suno-api.org/blog/2025/09-25-suno-v5-api)
- [Suno v4.5 Production Capabilities](https://www.musicbusinessworldwide.com/suno-is-getting-more-advanced-as-ai-music-generator-launches-v4-5-update-with-previously-unimaginable-production-capabilities/)
- [Voice Cloning in Suno](https://www.lalal.ai/blog/how-to-make-a-song-in-suno-with-your-own-voice-even-if-you-cant-sing-at-all/)
- [Suno Pricing 2025](https://margabagus.com/suno-pricing/)
- [Suno API Pricing Comparison](https://blog.laozhang.ai/api-services/suno-api-pricing-comparison/)
