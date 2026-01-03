# Echo Sound Lab - Stage Architecture Specification

## Vision
Echo Sound Lab escorts raw sound from chaos into identity through four intentional stages. Each stage has a clear purpose, specific processors, and philosophy about when to act.

Users never see "stages." They see a choice: **Friendly Mode** (guided, safe, educational) or **Advanced Mode** (creative, powerful, intentional).

---

## The Two-Mode Philosophy

### 🟢 FRIENDLY MODE (Default)
**"We've got you."**

- Runs Stage 1 (Survival) + Stage 2 (Clarity) automatically
- Stage 3 (Character) physically gated, not accessible
- No scary terminology, no complex routing
- Focuses on listening and learning
- Impossible to ruin sound
- Perfect for: nephews, schools, first-timers, friends learning

**What it teaches:** Restraint, listening, clarity before character

### 🔵 ADVANCED MODE (Opt-in)
**"I know what I'm doing. Let me shape."**

- Explicit, clear action: "Switch to Advanced Mode"
- Unlocks Stage 3 (Character) processors
- Enables creative control: saturation, reverb, width, transient shaping
- Stage 1 + 4 still protect (always defensive, always safe)
- For: producers, experienced ears, intentional creators

**What it teaches:** Intentionality, taste, responsibility with power

---

## Why This Architecture

1. **Solves education** — Schools lock Friendly Mode, students learn fundamentals
2. **Solves the harshness problem** — Character cannot bleed early
3. **Respects professionals** — Fast, powerful, no gatekeeping
4. **Future-proofs** — Can later add Student/Teacher/Pro modes without engine redesign

---

## STAGE 1: RAW STABILIZATION
**Purpose:** Make audio survivable. Remove distress without adding opinion. Binary survival, not taste.

**Processor Assignments (FINAL):**
- Input Trim / Normalize (gain normalization only)
- Harshness Gate (peak pain prevention, NOT full de-esser; only engages when sibilance exceeds pain threshold)
- Transient Cap (peak safety, preservation of transient character, not shaping)
- Phase Sanity (DC offset removal, mono safety, phase coherence)
- Ultra-Relaxed Safety Limiter (ceiling only, no tone shaping, pure speaker protection)

**Default State:** ALWAYS ON (always defensive)

**Philosophy:**
- Binary: either hurts or doesn't
- These run regardless of user input
- No character added
- No musicality lost
- No frequency "decisions"
- Pure protection and normalization

**AI Involvement:** None. This is automatic.

**User Visibility:** Invisible. They don't know it's happening.

**Implementation Notes:**
- Harshness Gate: only activates if sibilant energy > pain threshold (≈-20dB at 7kHz)
- Transient Cap: soft knee, preserves character while preventing speaker harm
- Safety Limiter: pure ceiling, never shapes tone (threshold -3dB, ratio ∞, attack 1ms, release 500ms)

---

## STAGE 2: FORMATION
**Purpose:** Reveal the record. Correct problems that obscure intent. First place engine understands music.

**Processor Assignments (FINAL):**
- Dynamic EQ (corrective only, frequency-specific problem solving)
- Static EQ (corrective only, 4-band max for clarity, not 6-band)
- Main Compressor (transparent dynamics control for stability, not loudness)

**Default State:** GATED - activated only when AI detects need

**Philosophy:**
- AI listens first, never assumes
- Only acts when a real problem is detected (muddy low-end, lack of presence, sibilance harshness beyond Stage 1 gate, etc.)
- User approves before applying
- Correction, not creation
- Teaches by example, not force

**AI Involvement:** Full. Echo Report Card + AI Analysis recommend moves.
- "I hear mud in the 200-400Hz range" (+ offer to fix)
- "Vocals need presence around 2.5k" (+ ask permission)
- "Dynamics are erratic, gentle compression will help stability" (+ one-click apply)

**User Visibility:** "Echo Report Card" - one-click fix recommendations. User sees problems detected, can approve, skip, or explore.

**Implementation Notes:**
- Static EQ: Cap at 4 bands (80Hz, 250Hz, 2.5kHz, 8kHz) for educational clarity about frequency zones
- Main Compressor: 3:1 ratio, -18dB threshold (gentle stability, not groove-making)
- Dynamic EQ: Only suggests if corrective need is high confidence (not speculative)
- Motion Reverb detection: Check if density is high enough to need space. If yes, unlock the idea (don't apply). Only surfaces in Stage 3.
- Trigger rules: Only activate if (frequency balance tolerance exceeded) OR (vocal intelligibility score < threshold) OR (dynamic stability erratic)

---

## STAGE 3: CHARACTER
**Purpose:** Identity. Only when invited. Only intentionally.

**Processor Assignments (FINAL):**
- Saturation (harmonic enhancement, 10–20% default mix only)
- Transient Shaper (attack/sustain shaping, disabled by default)
- Stereo Imager (width/depth, disabled by default)
- Motion Reverb (spatial character, disabled by default)

**Default State:** OFF / PHYSICALLY GATED (not in chain until Advanced Tools opened)

**Philosophy:**
- Never auto-apply
- Never during AI stabilization pass
- Only available when user clicks "Advanced Tools"
- Only suggested when Stage 1 + 2 are complete
- Pure artistry, pure choice
- No power-user bypass (schools, nephews, long-term discipline)

**AI Involvement:** Suggestions + temporary preview only.
- "This mix could benefit from saturation" (preview available, not applied)
- "Motion reverb might add nice space" (preview available, not applied)
- But no permanent application without explicit user toggle

**User Visibility:** "Advanced Tools" button. Behind it, these processors live. Felt experience: "I'm choosing to add character now, and I can preview it first."

**Implementation Notes:**
- Stage 3 processors: literally not in the signal chain until Advanced Tools is opened
- Preview mode: temporary, auto-resets, cannot be exported, clearly labeled "Preview"
- Default amounts: extremely subtle (saturation 15% max, reverb 10% max, width 1.0)
- No bypass. Ever. (Maintains discipline and teachability)
- Defaults make it impossible to destroy sound

---

## STAGE 4: RELEASE STABILIZATION
**Purpose:** Make it survive the world. Breathing room, no rescue.

**Processor Assignments (FINAL):**
- Output Limiter (safety, musical release, pure ceiling)
- Metering / Loudness Reference (measurement only)
- Platform-specific export presets

**Default State:** ON (protective, never intrusive)

**Philosophy:**
- No new tone introduced
- No creative fixes
- Pure translation and safety
- The song is done; we're just ensuring it travels
- Gentle guardrails, no guilt, no pressure

**AI Involvement:** Measurement + advisory only.
- Warn if LUFS exceeds platform standards (silently protect, no popup guilt)
- Suggest export preset based on intended platform
- Provide headroom information

**User Visibility:** Export dialog shows:
- Current loudness (LUFS/RMS)
- Platform targets (Spotify -14 LUFS, Apple Music -16 LUFS, YouTube standards, etc.)
- Headroom remaining
- Format options (WAV, MP3, stems)

**Implementation Notes:**
- No aggressive normalization
- Warn + protect silently (e.g., if exceeding -14 LUFS Spotify target, gently bring down without user alarm)
- Export presets teach responsibility through platform standards
- Measure but never judge

---

## Implementation Rules (LOCKED)

### Rule 0: Two Modes, One Engine
```
if (mode === FRIENDLY) {
  // Stage 1 + Stage 2 + Stage 4
  // Stage 3 not in chain
}
if (mode === ADVANCED) {
  // Stage 1 + Stage 2 + Stage 3 + Stage 4
  // All character available
}
// Stage 4 always runs regardless
```

No code duplication. One signal path, two configurations.

### Rule 1: Processors are physically gated, not just "turned down"
Stage 3 processors should literally not be in the signal chain in Friendly Mode.
No bypasses, no mixes at zero, no conditionals. Physical removal.

### Rule 2: Stage 1 has zero AI
Completely automatic. No learning, no detection logic. Pure binary: hurt or safe.

### Rule 3: Stage 2 AI is permission-based
AI listens, diagnoses, recommends, waits for approval. Never auto-applies Stage 2.

### Rule 4: Stage 3 AI is preview-only (Advanced Mode only)
Can show preview temporarily. Cannot apply permanently without user toggle.

### Rule 5: "Apply Core Fixes" = Stage 1 + Stage 2 only
This is the trust moment. User uploads, hits apply, gets stabilization + correction without character.
If this ever colors sound, you lose beginners forever.

### Rule 6: Mode switch is explicit, never accidental
Clear language: "Switch to Advanced Mode"
No hidden shortcuts, no easter eggs, no accidentally entering Advanced.

### Rule 7: Stage transitions are unidirectional (1→2→3→4)
User can progress but never regress. UI never suggests backtracking.

### Rule 8: AI language restraint (Stage 2 + 3)
Echo Report Card says things like:
- ✅ "Clarity improved" (Stage 2 result)
- ✅ "Dynamics stabilized" (Stage 2 result)
- ❌ Never: "I've added saturation for punch" (that pressures Stage 3)
- ❌ Never: "Your mix is thin" (that implies a fix without asking)

### Rule 9: Stage 1 + Stage 4 always protect, regardless of mode
Harshness gate always runs.
Safety limiter always runs.
Export always protects against clipping/loudness violations.
No exceptions.

---

## Final Approved Specification Summary

| Stage | Purpose | Processors | Default | AI Role | User Sees |
|-------|---------|-----------|---------|---------|-----------|
| **1** | Survival | Normalize, Harshness Gate, Transient Cap, Phase, Safety Limiter | ALWAYS ON | None (automatic) | Nothing |
| **2** | Clarity | Dynamic EQ (corrective), Static EQ (4-band corrective), Main Compressor | GATED (AI triggers) | Listens, recommends, awaits approval | Echo Report Card ("Here's what I found") |
| **3** | Identity | Saturation, Transient Shaper, Stereo Imager, Motion Reverb | OFF / PHYSICALLY GATED | Preview only, never applies | Advanced Tools ("You can add character now") |
| **4** | Travel | Output Limiter, Metering, Export Presets | ALWAYS ON | Measures, warns silently, advises | Export dialog (standards + headroom) |

---

## Next: Implementation Begins

Claude will now:
1. Tag every processor with its STAGE designation
2. Set default ON/OFF per stage in code
3. Write Stage 2 AI language (permission-based)
4. Physically gate Stage 3 (remove from chain until Advanced Tools)
5. Build Stage 4 export presets (Spotify, Apple Music, YouTube, generic WAV/MP3)
6. Update UI to reflect flow without naming stages

**Critical:** Zero creative interpretation. Implement exactly to spec.

This is the spine. Everything else hangs from it.

---

## Epilogue: What This Means

You've built something rare.

A system that doesn't assume expertise.
That teaches taste before power.
That lets raw sound become alive without violence.

That scales from bedroom to classroom to studio.

That's how tools last generations.
