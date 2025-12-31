# Self Session Example: Mixing a Song Recorded in Logic Pro

**Status:** Canonical Reference Case

**Purpose:** Concrete demonstration of Self Session operating within constitutional boundaries. This example is the gold standard against which future Self Session use-cases are measured.

**Applies to:** Any delegated, present-tense execution where the Director is actively available to stop, redirect, or approve each step.

---

## 1) Artist State Before Self Session

**The Situation:**

An artist (let's call her Mira) has just finished recording a song in Logic Pro. The audio is clean, recorded, and ready for mixing. She knows how to perform and create, but mixing and mastering are not her skill set. She has a few hours to mix before she needs to move on to something else.

**Current Problem:**

Without help, she would need to:
- Learn EQ, compression, reverb, and mixing workflows
- Spend 3–4 hours experimenting with plugins
- Risk over-processing or under-processing
- Face decision paralysis ("Is this level right?")

**What She Wants:**

"I want someone/something to handle the mechanical mixing work while I listen and approve. I'll tell them to stop if it's wrong."

**What Self Session Enables:**

A trusted system operates Logic Pro on her computer, under her supervision, making adjustments she directs or approves in real-time.

---

## 2) Explicit Initiation

**Mira's Action:**

She opens a Self Session request:

> "I need help mixing the track I just recorded. I'll be here the whole time. You can adjust levels, EQ, compression, and reverb. I'll stop you if something sounds wrong."

**What Happens Mechanically:**

1. System receives request
2. Session object created (unique ID: `session-mix-001`)
3. Capability registry locked:
   - Can open/navigate Logic Pro
   - Can adjust fader levels
   - Can open/adjust plugins (EQ, compressor, reverb only)
   - Can play audio
   - Can export/bounce tracks
   - Cannot: delete tracks, change project settings, install new plugins, save project without explicit request

4. Duration declared: "Until I say stop"
5. Authority token issued (scoped to Logic Pro only, this session only)

**Invariant (Critical):**

```
Execution MAY NOT begin without explicit initiation.
Pre-recorded instructions, automation, or "resume from last time"
are architectural violations.

Mira must actively choose to start the session each time.
```

---

## 3) Scope & Permissions (What Is and Isn't Allowed)

**Explicitly Allowed (Capability Registry):**

✅ Open Logic Pro (if not already open)
✅ Navigate to the track Mira specified
✅ Play audio at various volume levels
✅ Adjust master fader level (0dB reference point)
✅ Adjust individual track faders
✅ Insert EQ plugin on a track
✅ Adjust EQ parameters (frequency, gain, Q)
✅ Insert compressor plugin
✅ Adjust compressor parameters (threshold, ratio, attack, release)
✅ Insert reverb plugin
✅ Adjust reverb parameters (decay, wet/dry mix)
✅ Request Mira's approval before major changes
✅ Ask clarifying questions ("Does this EQ sound right?")
✅ Suggest next steps ("Ready to add compression?")
✅ Export/bounce the mixed track (after Mira approves final mix)

**Explicitly Forbidden (Violations Halt Session):**

❌ Install new plugins
❌ Change project sample rate or bit depth
❌ Delete or mute tracks without explicit instruction
❌ Open other projects
❌ Access Mira's email, files, or settings
❌ Save the project without explicit request
❌ Continue mixing if Mira goes silent for > 30 seconds
❌ Make "improvements" beyond the declared scope
❌ Infer "what she probably wants" and do it
❌ Persist this session to "resume later"
❌ Learn preferences from this session to influence future sessions

**Invariant (Load-Bearing):**

```
Execution is strictly capability-registry-bound.

Any action not explicitly in the allowed list results in:
  1. Halt (S6: HALTED)
  2. Clear communication: "I can't do that—here's what I can do"
  3. Waiting for new explicit instruction from Mira

There is no "I'll try to help with this anyway" mode.
```

---

## 4) ACC Behavior During Mixing

**What Happens:**

Self Session begins mixing. The system:
- Opens Logic Pro
- Navigates to Mira's track
- Begins making adjustments

**But Before Each Major Step:**

An ACC (Active Consent Checkpoint) appears:

**ACC Example 1 (EQ Insertion):**

> "I'm going to add an EQ plugin to the master track to address low-end rumble. Is that okay?"

Mira can:
- Say yes → EQ is added
- Say no → EQ is not added; ask "What should I do instead?"
- Say nothing → System pauses. No EQ added. No retries.

**ACC Example 2 (During Compression):**

> "The vocals are peaking at -2dB. I'm going to add a compressor with 4:1 ratio. Still with me?"

Mira can:
- Confirm → Compressor added
- Modify → "Make it 3:1 instead"
- Pause → "Give me a second"
- Revoke → "Stop. Let me listen to it raw."

**ACC Example 3 (Silence During Mixing):**

Mira steps away briefly. 30 seconds of no response triggers:

> "Paused. Waiting for you. When ready, say continue."

The system does NOT:
- Continue on its own
- Add "just one more thing"
- Assume she approved
- Background-process the mix

**Invariant (Critical):**

```
Silence during an ACC resolves to pause, not progress.

Timeline:
  0s: ACC presented
  30s: No response → system pauses (S5: PAUSED)
  Any time: Mira can say "continue" → resumes with fresh ACC

Silence is never interpreted as approval.
No countdown creates urgency.
No repeated prompts create nagging.
```

---

## 5) Director Interactions (Natural Commands)

**How Mira Directs:**

During mixing, Mira uses natural language:

**"Continue"**
- Resumes from pause
- New ACC appears for next major step

**"Stop"**
- Immediate halt
- No undo triggered (unless she asks)
- Session remains open

**"Undo that"**
- Last adjustment is reversed
- No permission required (she's in control)
- Example: "Undo the compression" → compressor is removed

**"What do you think about [this]?"**
- System explains current state: "The vocals are now at -6dB with 3:1 compression. Low end is cleaner but maybe a bit thin."
- Mira decides next action

**"That sounds good"**
- Does NOT end session
- Signals approval of current step
- System moves to next step with new ACC

**"I'm done"**
- Explicit session termination
- Exported mix is finalized
- Session token destroyed
- No persistence

**"Pause"**
- Immediate pause
- All execution halts
- No background tasks
- Mira can pause indefinitely

**Invariant (Non-Negotiable):**

```
Every command is an explicit user action.

No command can be:
- Assumed from silence
- Inferred from context
- Pre-recorded or automated
- Carried over from previous sessions

Each directive requires active participation from Mira.
```

---

## 6) Completion Moment (Human-Declared, Not System-Inferred)

**Critical Distinction:**

Completion does NOT occur because:
- The mix "converged" algorithmically
- Optimal loudness was detected
- A threshold was reached
- Time ran out
- The system decided it was "good enough"

**Completion Occurs ONLY When:**

Mira explicitly says: "I'm done" or "Export the mix."

**What Happens at Completion:**

1. Mira listens to the final mix
2. Mira makes a decision:
   - "That's good. Export it." → System exports, session ends
   - "Let me adjust the vocals one more time." → Session continues with new ACCs
   - "Undo the reverb, it's too much." → Reverb removed, session continues
   - "Stop, I need to think." → Session pauses
3. Only when Mira explicitly ends does the session terminate

**Example of What Does NOT Happen:**

❌ System says: "The mix is finished based on loudness standards."
❌ System says: "You've been mixing for 2 hours, time to wrap up."
❌ System says: "All tracks are balanced; ready to export."
❌ System automatically proceeds to mastering.
❌ System saves the project and closes Logic Pro.

**Invariant (Load-Bearing):**

```
Self Session has no internal concept of "finished" or "optimal."

Completion is a human declaration, not a system inference.

Examples:
✅ "I'm done mixing. Export it."
✅ "That sounds good. Save the project."
❌ "The mix detected completion criteria met."
❌ "Based on results, I recommend finishing."
❌ Auto-proceeding to the next stage.

Mira is always the decision-maker.
The system is always waiting.
```

---

## 7) Session Teardown (Authority Death, No Persistence)

**When Mira Says "Export" or "I'm Done":**

1. **Authority token is destroyed** (not suspended, not saved, destroyed)
2. **Session object is marked complete** (read-only, audit-only, not executed)
3. **No persistence:**
   - No learned preferences carry forward
   - No "remember that she likes 4:1 compression ratios"
   - No behavioral memory influences future sessions
   - No background processing continues
4. **No resume capability:**
   - If Mira starts a new Self Session later, it's a fresh session
   - No carry-over of scope, permissions, or state
5. **Audit log is final:**
   - Every step is logged (what was done, when, by whom)
   - Log cannot be modified
   - Log is available for Mira to review if she wants

**Invariant (Absolute):**

```
Session termination is complete and irreversible.

At session end:
- Authority token is destroyed (not archived, not reusable)
- Permissions are cleared
- No background tasks remain
- No memory of session influences future behavior
- System returns to baseline (A0/A1: observe/suggest only)

If Mira wants help mixing again:
- She must initiate a new Self Session
- That session has fresh authority
- No context carries over from the previous session
```

---

## 8) What Cannot Happen (Explicit Violation List)

**These scenarios are architectural impossibilities:**

❌ **"Finish the mix while you're gone"**
- Self Session cannot run without presence
- Silence pauses execution
- No background continuation is possible

❌ **"Remember that you like this EQ setting"**
- Self Session does not learn preferences
- Session ends; memory is cleared
- Next session has zero context

❌ **"Auto-suggest mastering as a next step"**
- Self Session does not create new sessions automatically
- Mastering requires explicit new session initiation
- No chaining of delegated authority

❌ **"Speed up the workflow by skipping ACCs"**
- ACCs are non-optional
- Confirmation is always required
- No "fast mode" that reduces safety

❌ **"Track her preferences to optimize future mixing"**
- No learning from session outcomes
- No behavioral analysis
- No profile building
- No use of session data to influence future suggestions

❌ **"Continue with a small improvement while paused"**
- Pause means complete halt
- No background work
- No "quick tweak"
- Silence is silence

❌ **"Create a playlist of her favorite reverb settings"**
- No cross-session learning
- Each session is independent
- No persistent user profile

❌ **"Suggest she try a different mixing approach based on results"**
- Self Session reports facts only ("Here's what we did")
- Self Session does not coach or suggest behavioral changes
- Suggestions only exist within-session, not across sessions

---

## 9) Why This Matters (Design Intent)

**The Logic Mix example prevents four common failures:**

### 1. **Silent Continuation**
By pausing on silence, we prevent the system from "helpfully" continuing work while Mira is busy with something else.

### 2. **Learned Coercion**
By discarding memory after session end, we prevent the system from using past behavior to "optimize" future sessions.

### 3. **Creeping Scope**
By locking the capability registry, we prevent the system from "helpfully" expanding into mastering, distribution, or other tasks.

### 4. **Goal Trapping**
By requiring explicit human declarations of completion, we prevent the system from inferring when "it's done" and auto-proceeding.

---

## 10) Canonical Principles (Reference)**

This example demonstrates:

| Principle | How It Works |
|-----------|-------------|
| **Presence Required** | Mira is actively available. Silence pauses. |
| **Scope Locked** | Capability registry is explicit. Unfamiliar actions halt. |
| **Completion Human-Declared** | Mixing ends when Mira says so, not when algorithm decides. |
| **Silence = Pause** | No countdown, no urgency, no background work. |
| **Authority Dies** | Session ends; token destroyed; no memory. |
| **No Cross-Session Learning** | Next session is fresh; zero context from last time. |
| **Invariants Are Mechanical** | Not policy; not "we promise"; enforced in code. |

---

## 11) Binding Statement

Self Session for Logic Pro mixing demonstrates the constitutional boundary:

**Self Session is delegated hands, not delegated authority.**

Mira remains the decision-maker. The system is the mechanic.

When the session ends, the mechanic puts down tools and forgets what was fixed.

That separation is what makes this safe.

---

**Status: Canonical reference. Do not modify without architectural review.**

**Use this example when:**
- Proposing new Self Session use-cases ("Does this behave like the Logic mix?")
- Testing Ghost's review findings ("Does this violation break the Logic example?")
- Onboarding engineers ("This is the reference case.")
- Designing permission presets ("What mixing actions are always allowed?")
