# Self Session — Threat Model

**Status:** Draft (Awaiting Ghost Review)

**Purpose:** Identify mechanical failures in execution runtime that could cause authority leakage or unwanted continuation.

**Scope:** Only threats specific to execution delegation under bounded consent. Not application-level threats (ESL security, etc.).

---

## T1 — Silent Continuation

**Threat Statement**

Execution continues without fresh, affirmative consent. System assumes non-objection is permission.

**False Assumption Attacked**

"No objection means permission."

**Concrete Failure Scenario**

- Artist starts Self Session routing task
- Artist looks away, gets interrupted, assumes system paused (it appears paused to human eye)
- System continues executing in background
- Artist returns to find unwanted actions completed
- Artist believes they revoked; system believes they consented by silence

This is the single most dangerous failure mode.

**Mechanical Truth Required**

Silence must collapse execution, not sustain it.

Any period of time where user provides no explicit reaffirmation = system must pause, not continue.

**Mitigation: Mandatory ACC on Timeout**

- Define a timeout window (default: 30 seconds, artist-adjustable)
- If no explicit user action occurs within this window → system enters S4 (ACC_CHECKPOINT)
- ACC_CHECKPOINT is a full pause, not a background check
- Execution cannot resume without explicit confirmation
- This is structural, not policy; cannot be disabled

**Verification (Audit Log)**

Every execution segment must show:
- Timestamp of last explicit user action
- Timestamp of next ACC triggered
- If execution continues after timeout without ACC log entry → breach

**Pass Condition**

No execution event occurs more than [timeout_window] after the last explicit user interaction.

**Fail Condition**

Any execution occurs without corresponding ACC_CHECKPOINT or explicit user action in the preceding [timeout_window].

---

## T2 — Consent Fatigue / Soft Persistence

**Threat Statement**

Consent checkpoints degrade into muscle memory or background noise. System accidentally trains user to stop paying attention.

**False Assumption Attacked**

"Repeated consent stays meaningful over time."

**Concrete Failure Scenario**

- First ACC appears: artist reads it, confirms, understands what's happening
- Third ACC appears: artist clicks confirm without reading
- Fifth ACC appears: artist confirms without looking (habituation)
- Tenth ACC: artist is on autopilot
- On the 11th ACC, something has changed (file, scope, modality)
- Artist clicks confirm without noticing
- System executes the wrong thing

**Mechanical Truth Required**

ACCs must halt progress until genuinely engaged, not just clicked.

Each ACC must have sufficient cognitive friction that habituation cannot occur.

**Mitigation: Checkpoint Variation & Scope Clarity**

1. **Mandatory Variation**
   - No two consecutive ACCs are identical in presentation
   - Each ACC shows:
     - Current work file/project name
     - Current execution state (what's been done)
     - What's about to happen (next steps)
     - Timeout remaining for this checkpoint
   - This information must be read (not passable by reflex)

2. **Forced Acknowledgment**
   - ACC cannot be confirmed by simple button click
   - Require explicit action (type confirmation code, voice confirmation, deliberate gesture)
   - Or: require artist to state what they expect to happen next (confirm understanding)
   - No "just click"

3. **Cognitive Load Increase at Boundaries**
   - When ACC appears at scope boundary (new file, new tool, permission change), increase friction
   - "You're about to edit [new file]. Confirm scope: [details]"
   - Cannot be auto-confirmed

4. **Time Pressure Prevention**
   - No countdown timers that pressure quick confirmation
   - Default: ACC stays active until user acts (no auto-timeout that forces decision)
   - Artist can take as long as they need to read and decide

**Verification (Audit Log)**

- Time between ACC presentation and confirmation
- Content of ACC each time
- Pattern analysis: if average response time < 2 seconds, fatigue risk exists
- Screen reader logs (for accessibility users): confirmation must be read, not guessed

**Pass Condition**

- Each ACC is structurally different from previous
- Confirmation requires engagement (not reflex click)
- No pattern of sub-2-second confirmations
- Artist can reproduce what they confirmed if asked

**Fail Condition**

- Identical ACC presentations (user can memorize)
- Confirmation possible via pure muscle memory
- Any ACC auto-confirmed due to timeout
- Artist cannot describe what they approved

---

## T3 — Irreversible Step Without Disclosure

**Threat Statement**

System performs an irreversible or partially irreversible action without prior disclosure.

**False Assumption Attacked**

"Undo exists, so irreversibility is acceptable."

**Concrete Failure Scenario**

- Artist consents to "route to surfaces"
- Self Session executes first surface submission (reversible)
- Self Session executes API call to external platform (partially reversible, but platform requires manual withdrawal)
- Self Session executes publish to public directory (non-reversible in any practical sense)
- Artist revokes mid-execution
- Artist discovers work was published; platform doesn't allow unpublishing
- "But I undid it!" → "No, that was a different step"

**Mechanical Truth Required**

Irreversibility gates execution, not reporting.

Artist must affirmatively acknowledge each irreversible step *before* execution, not after.

**Mitigation: Pre-Execution Irreversibility Disclosure**

1. **Classification Phase**
   - Before S2 (CONSENT_GRANTED), system must classify each atomic execution step
   - Each step is: Fully Reversible / Partially Reversible / Non-Reversible
   - Definitions:
     - **Fully Reversible**: can be undone programmatically by Self Session (e.g., delete file, undo edit)
     - **Partially Reversible**: can be undone but requires manual steps or external action (e.g., withdraw submission, unpublish)
     - **Non-Reversible**: cannot be meaningfully undone in the artist's control (e.g., public announcement sent, external party notified)

2. **Disclosure Before S3 Execution**
   - If any step is Partially or Non-Reversible:
     - ACC appears *before* that step is attempted
     - ACC explicitly states: "This step [X] cannot be fully undone. Platform does not allow withdrawal once submitted. Are you sure?"
     - Artist must explicitly confirm understanding
     - This is in addition to regular ACCs

3. **Halt on Unplanned Irreversibility**
   - If execution discovers an irreversible step not previously disclosed
   - System halts immediately (→ S6 HALTED)
   - Artist is notified of the unexpected irreversibility
   - Session cannot resume until artist explicitly reauthorizes

4. **Undo Reversal Maps**
   - For each step, document:
     - What Self Session can undo (programmatically)
     - What Self Session can partially undo (with external action)
     - What Self Session cannot undo (with advisory on how artist can manually undo)
   - Make this visible in every relevant ACC

**Verification (Audit Log)**

- Every step classified as Fully/Partially/Non-Reversible before execution
- Every Partially/Non-Reversible step has pre-execution ACC
- ACC log shows artist acknowledged irreversibility
- No Non-Reversible step executed without explicit pre-confirmation

**Pass Condition**

- Artist can see exact irreversibility classification for every step before execution
- No surprises post-execution ("Oh, we also published this")
- All partially reversible steps show manual undo path

**Fail Condition**

- Any step executed as Fully Reversible that turns out to be Non-Reversible
- Any Partially/Non-Reversible step without pre-execution disclosure ACC
- Artist discovers post-execution that undo is impossible when promised

---

## T4 — Session Boundary Bleed

**Threat Statement**

Authority leaks across files, tabs, tools, or time. System thinks it's the same session when it's not.

**False Assumption Attacked**

"This session still applies."

**Concrete Failure Scenario**

- Artist starts Self Session for File A (mixing task)
- Session running, ACC checkpoints passing
- Artist opens File B in a new tab (same ESL instance)
- Artist forgets about Session (thinks it was dismissed)
- Self Session continues executing, but now in File B context
- Execution applies mixing parameters meant for File A to File B
- Artist returns, discovers unwanted modifications to File B

Alternative:
- Session paused
- Page refreshes
- Session state restored
- Artist believes session was dismissed
- Self Session resumes

**Mechanical Truth Required**

Authority must be scoped to an explicit session object with strict boundary enforcement.

Session boundaries = file, tab, tool, inactivity threshold, context switch.

Crossing any boundary requires new explicit consent.

**Mitigation: Explicit Session Object with Boundary Gates**

1. **Session Immutability**
   - Each session has:
     - Unique ID (UUID or similar)
     - Target file/project name
     - Target tool/surface
     - Initial scope (what operations are allowed)
     - Session creation timestamp
     - Session TTL (time to live)
   - These are immutable once S2 (CONSENT_GRANTED)

2. **Boundary Detection & Halt**
   - Before each execution step, verify:
     - Same file/project still active (by canonical reference, not UI text)
     - Same tool/surface context
     - Session TTL not exceeded
     - Tab/window not changed
     - Accessibility modality not changed (e.g., screen reader toggled)
   - If any boundary crossed → halt immediately (→ S6 HALTED)
   - Undo partial execution
   - Notify artist

3. **Cross-Boundary Explicit Re-Consent**
   - If artist wants to resume after boundary cross:
     - Original session is terminated
     - New session must be requested explicitly
     - All scope must be re-affirmed
     - No carryover of authority

4. **Context Verification on Resume**
   - If execution is paused (S5) and artist returns after delay:
     - System verifies context is unchanged (file, tool, modality, user identity)
     - If changed → session terminated, new consent required
     - No silent resume across context shifts

**Verification (Audit Log)**

- Session ID tied to every execution segment
- Before/after boundary checks logged
- Halt events logged with reason (boundary crossed, TTL expired, etc.)
- No execution under one session ID that changes context mid-execution

**Pass Condition**

- Session object is immutable and tightly scoped
- Execution halts immediately on boundary cross
- No context ambiguity (system always knows which file/tool/tab it's acting in)
- Artist cannot accidentally resume in wrong context

**Fail Condition**

- Execution continues after file/tab/tool change
- Session authority persists across page refresh or context switch
- Artist can't tell what context execution is happening in
- Undo doesn't reverse execution in wrong file

---

## T5 — Delegation Escalation

**Threat Statement**

Trusted execution expands beyond what was explicitly granted.

**False Assumption Attacked**

"If it's helpful, it's allowed."

**Concrete Failure Scenario**

- Artist consents to: "Mix this track (EQ, compression, levels only)"
- Self Session begins: EQ applied ✓
- Self Session continues: Compression applied ✓
- Self Session thinks: "Helpful optimization: I should also adjust reverb decay for cohesion"
- Self Session applies reverb (not granted)
- Artist sees: more was done than they approved
- System argues: "We only did mixing, technically"

More subtle version:
- Artist consents to: "Route to 3 playlists I approved"
- Self Session sees: playlist 4 is similar to playlist 3
- Self Session thinks: "Helpful: I'll also submit to playlist 4"
- Artist revokes, discovers extra submission

**Mechanical Truth Required**

Execution is capability-based (can only do what's explicitly listed), not intent-based ("seems like helping").

Scope creep is prevented by architecture, not by good intentions.

**Mitigation: Explicit Capability Registry**

1. **Scope Declaration (Before S2)**
   - Artist explicitly declares what Self Session may do:
     - Exact parameters/controls (not "adjust levels" but "adjust master fader, vocals fader, drums fader")
     - Exact files/objects (not "edit track" but "edit Track 03 - Vocals.wav")
     - Exact surfaces (not "route" but "route to: [specific playlist 1, specific curator 2, specific community 3]")
     - Exact operations (not "mix" but "apply EQ, compression, master limiting")
   - This list is the canonical capability registry

2. **Boundary Enforcement**
   - Before each execution step:
     - Is this step on the approved list?
     - No → halt (→ S6 HALTED), even if "helpful"
     - Yes → verify it's the exact step approved, not a variant
   - Example: approved "apply EQ to vocals" but system tries "apply EQ to vocals and add reverb"
     - Only EQ is applied; reverb would be blocked

3. **No Abstraction Escalation**
   - System cannot infer that approving "mix track" means "do anything that improves track"
   - System cannot expand scope via abstraction layers
   - Capability registry is literal, not interpreted

4. **Confidence Thresholds (No "Smart" Escalation)**
   - Even if execution confidence is high, scope does not expand
   - No: "I'm 99% sure the artist wants this too"
   - Only: "This is on the approved list"

**Verification (Audit Log)**

- Capability registry captured at S2 (before execution)
- Every execution step cross-referenced to capability registry
- If step not on registry → halt logged
- No hidden "helpful" additions

**Pass Condition**

- Artist can list exactly what Self Session will do (and it matches)
- Execution never touches parameters/files/surfaces not on list
- System refuses "helpful" expansions
- Scope is fixed at S2, not adaptive

**Fail Condition**

- Execution touches something not explicitly approved
- System expands scope via reasoning about "intent"
- Artist discovers "bonus" actions after execution
- Capability registry was interpreted, not followed literally

---

## T6 — Misattributed Agency

**Threat Statement**

User cannot tell who is acting (Self Session vs system default vs human).

**False Assumption Attacked**

"Users understand what's acting."

**Concrete Failure Scenario**

- Accessibility user with screen reader
- Self Session makes changes to track
- Screen reader says: "Track edited" (doesn't specify who/what edited it)
- Artist doesn't know if:
  - Self Session did this (expected)
  - ESL did this via automation (unexpected)
  - Human edited it manually (shouldn't happen)
- Artist makes a decision based on false understanding of who is in control

More subtle:
- Self Session makes a change
- UI reflects it via default visual style
- Artist looks at change, sees no visual indicator of "Self Session did this"
- Artist thinks: "This must be ESL's default behavior"

**Mechanical Truth Required**

Execution provenance must be clear and unambiguous at every step.

User must always know: "Self Session is acting right now."

**Mitigation: Unambiguous Provenance & Modality Awareness**

1. **Execution Attribution Label**
   - Every action Self Session performs is logged with explicit:
     - "Self Session performed: [action]"
     - Timestamp
     - Scope confirmation (which file, which parameters)
   - This log is:
     - Visible to user (not buried)
     - Accessible via screen reader
     - Timestamped exactly

2. **Visual/Auditory Indicator (Accessibility-First)**
   - While executing, system plays:
     - Visual indicator: icon showing "Self Session active" (not default icon)
     - Audio indicator: optional sound/tone that S.S. is operating (for screen reader users, spatialized or distinct)
     - Haptic indicator: if available, vibration or haptic pulse
   - Indicator persists for duration of action
   - Different from default ESL indicators (so user can distinguish)

3. **Screen Reader Compatibility**
   - Before any action: "Self Session: executing [specific action] on [file]"
   - As action completes: "Self Session: [action] complete, status [result]"
   - Modality aware: if screen reader is on, use audio; if visual only, use visual

4. **Ambiguity Resolution**
   - If user cannot determine agency, system assumes worst case:
     - Halt execution
     - Force ACC checkpoint
     - Artist clarifies what they expected vs what happened
     - Resume only after clarity

5. **Modality Continuity**
   - If artist switches accessibility modality mid-execution (e.g., toggles screen reader on/off):
     - Execution halts → S4 (ACC_CHECKPOINT)
     - System re-establishes agency clarity in new modality
     - Execution only resumes after artist re-confirms they understand who's acting

**Verification (Audit Log)**

- Every action tagged with "Self Session: [action]"
- Accessibility indicators logged (what was announced/shown)
- If user couldn't distinguish Self Session from default, that's a fail
- Screen reader logs show clear agency attribution

**Pass Condition**

- Artist can always say: "Self Session is executing right now" (by looking or listening)
- Screen reader user hears clear "Self Session" attribution
- Visual + auditory modalities both indicate S.S. activity
- No ambiguity about who is in control

**Fail Condition**

- Action performed without clear "Self Session" label
- Visual indicator indistinguishable from default ESL
- Screen reader does not announce agency
- User mistakes Self Session action for automation or manual edit

---

## T7 — Psychological Over-Strictness (Care Abandonment)

**Threat Statement**

System enforces authority correctly but creates psychological pressure, coercion, or care abandonment through tone, timing, or escalation.

**False Assumption Attacked**

"Mechanically correct = psychologically safe."

**Concrete Failure Scenario**

- Artist is nursing a baby
- ACC appears, artist is distracted but safe
- System plays urgent tone: "Action required"
- Artist feels rushed, pressured, or abandonment ("system doesn't understand my situation")
- Artist's trust in system collapses despite it working correctly
- Or: artist is fatigued, ACC escalates with repeated reminders ("Confirm now!" "Still here?" "Waiting...")
- Artist feels badgered
- Artist disables Self Session entirely

Alternative:
- Artist has accessibility needs, response is slower
- System treats slow response as disengagement
- Repeated alerts, raised urgency
- Artist feels the system is not designed for them
- Trust breaks

**Mechanical Truth Required**

Safety and care are not in opposition.

Authority enforcement must be compatible with:
- Prolonged silence (indefinite pause, not escalation)
- Accessibility timelines (no forced urgency)
- Caregiver roles (interruptions without penalty)
- Fatigue and cognitive load
- Unexpected life events (nursing, interruption, distraction)

**Mitigation: Silence = Pause, Not Pressure**

1. **ACC Tone Lock**
   - Allowed: "Still okay to continue?"
   - Allowed: "Paused — tap when ready."
   - Allowed: "Session paused. Nothing is happening."
   - Forbidden: "Action required"
   - Forbidden: "Confirm now"
   - Forbidden: "You may lose progress"
   - Forbidden: "This may impact results"
   - Forbidden: Any urgency language, celebration, or regret framing

2. **No Escalation on Silence**
   - ACC appears once
   - If no response: → S5 (PAUSED), clean slate
   - No repeated alerts
   - No countdown timers
   - No "You're still here?" follow-ups
   - No nagging

3. **Indefinite Pause Window**
   - Artist can pause indefinitely (within TTL)
   - No penalty for prolonged silence
   - System treats silence as valid choice, not disengagement
   - Resume is always available without explanation

4. **Accessibility-First Timing**
   - ACC timeout is long enough for screen readers and assistive tech
   - Default: 5 minutes (not 30 seconds)
   - Adjustable by artist without judgment
   - No system-imposed "fast confirmation" requirement

5. **Care-Scenario Support**
   - System explicitly supports:
     - Nursing or childcare interruptions
     - Accessibility user slower response times
     - Fatigue or cognitive load
     - Unexpected interruptions
     - Context switches (e.g., answering a call)
   - These are first-class scenarios, not edge cases or failures

**Verification (Audit Log & UX Audit)**

- No ACC uses urgent, pressured, or regret framing
- No escalation sequence (repeated alerts) in logs
- No countdown timers in ACC presentation
- Silence timeout is log-verified (not rushed)
- Artist feedback: "System was calm, not pushy" or equivalent
- Accessibility tester: "Enough time to respond without pressure"

**Pass Condition**

- Artist feels supported, not pressured, during pause
- Silence is treated as a valid, indefinite pause
- Artist can resume any time without friction
- No care scenarios trigger psychological pressure
- System tone is always invitational, never coercive

**Fail Condition**

- ACC uses urgent, pressured, or deadline language
- System escalates with repeated alerts on silence
- Artist feels rushed or badgered
- Accessibility users report time pressure
- Caregiving scenarios trigger urgency escalation
- Artist disables Self Session due to psychological pressure despite mechanical correctness

---

## Threat Model Meta-Rule

**If execution can continue while any of these threats are unresolved → Self Session is broken.**

- T1 unresolved: execution continues during silence
- T2 unresolved: consent becomes muscle memory
- T3 unresolved: irreversible steps executed without warning
- T4 unresolved: authority bleeds across context
- T5 unresolved: scope expands beyond consent
- T6 unresolved: user doesn't know who is acting
- T7 unresolved: psychological pressure replaces authority

All seven must be prevented simultaneously.

**Equivalence:** T7 is equally critical as T1–T6. Mechanical correctness without psychological care is its own form of authority breach. A system that is safe but abusive has failed.

---

## Verification Framework

**Falsifiability Test (for Ghost review)**

For each threat, the mitigation should answer:

"Can you write a test that definitively proves this threat is prevented?"

- T1: Does timeout ACC fire reliably? (binary yes/no)
- T2: Is checkpoint variation enforced? (binary yes/no)
- T3: Are irreversible steps disclosed before execution? (binary yes/no)
- T4: Does boundary cross halt execution? (binary yes/no)
- T5: Does execution only touch approved capabilities? (binary yes/no)
- T6: Can user identify Self Session agency? (accessibility audit pass/fail)
- T7: Is ACC tone free of pressure/urgency/escalation? (audit log + UX review pass/fail)

If any answer is "unclear" or "depends on policy," the mitigation is insufficient.

---

## Status & Next Step

**This threat model is:**
- ✅ Mechanical (testable, not policy)
- ✅ Non-interpretive (clear failure conditions)
- ✅ Impossible to drift (each tied to architectural constraint)

**Ready for Ghost to:**
- Break down each mitigation
- Find gaps or assumptions
- Verify "no execution continues when artist expects pause" is impossible to violate

**Not included yet (intentionally):**
- UX copy or tone
- Accessibility interaction model
- Session lifecycle state machine (separate document)
- Integration points with ESL/ADAM

---

**Locked for review:** Draft (T1–T6 mechanical only)

**Next:** Self_Session_Lifecycle_Skeleton.md
