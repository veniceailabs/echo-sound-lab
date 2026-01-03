# ADAM Contract (MVP)

Status: Locked (Sections 1-8)

Subsystem: ADAM — Artist Development Assistant Mechanism
Parent: ESL ("The Ark")
Related: SSC_MVP_CONTRACT.md (authority/intent constraints), ADAM_THREAT_MODEL.md (safety guardrails)

---

## 1) Preamble — Purpose

ADAM (Artist Development Assistant Mechanism) exists to answer a question
artists have stopped asking because the system doesn't allow it:

"What if finishing a song meant finishing work, not starting a marketing job?"

ADAM is the answer. It is the quiet infrastructure that carries finished art
into the places where it belongs—without the artist needing to know where those
places are, how to reach them, or how to convince them.

By sunset of release, an artist should know: their work was heard by someone
who needed it. And they were paid for it. That's not a feature. That's a
baseline.

### What ADAM Is Not

ADAM does not judge art, predict success, rank creators, or require artists to
perform marketing labor. It does not optimize people, extract value, or trade in
attention games. Its purpose is not growth, virality, or scale—but continuity
between creation, attention, and livelihood.

ADAM defaults to inaction unless explicitly enabled.
Silence is not consent.

---

## 2) Authority Boundaries

ADAM operates under explicit authority levels inherited from SSC (Safe System Control).
It is architecturally impossible for ADAM to exceed these bounds, regardless of artist
request, investor pressure, or "optimization opportunity."

### Inheritance & Architectural Ceiling

ADAM inherits SSC's permission model and constraints. This is not a limitation we will
relax. It is the foundation that keeps ADAM from becoming a growth weapon.

A3 (autonomous, background operation without explicit per-action consent) is
intentionally impossible. This is not "not yet implemented." It is impossible by design.

### Authority Levels (Mechanical Definition)

**A0 — Observe**
- ADAM analyzes the finished work (metadata, sonic fingerprint, emotional intent, assets)
- ADAM generates routing plans and explains them
- ADAM reads surface availability and eligibility
- Zero state change. Zero outbound communication.

**A1 — Suggest**
- ADAM recommends routing targets based on analysis
- ADAM explains why a target is/isn't a good fit, with tradeoffs visible
- ADAM presents options without taking action
- Artist sees recommendations only. Artist decides.

**A2 — Act (Explicit Grant Required)**
- ADAM submits/sends/publishes only after artist explicitly grants action scope
- Scope is logged (what surfaces, targets, duration)
- Undo path is defined and functional before action
- ADAM executes only the granted scope and stops
- Artist can revoke or pause at any time

**A3 — Intentionally Impossible**
- No circumstance in any scenario activates this tier
- Not in MVP, not in future, not "if we ever need to scale"
- This tier does not exist

### Operational Scope (What ADAM Can and Cannot Touch)

**ADAM may operate on:**
- Public submission surfaces (playlists, curators, radio shows, newsletters with open submissions)
- Official APIs with explicit terms allowing routing/submission
- Opt-in communities and creator spaces (Discord, forums, collectives with submission paths)
- Direct-to-fan platforms (Bandcamp, Patreon, tip systems, payment rails)

**ADAM may never operate on:**
- Private messaging, DMs, or email (even if automated)
- Private data (follower lists, profile details, unreleased work)
- Platforms that forbid automation in their terms of service
- Any surface without explicit public submission path or opt-in
- Rate-limited systems by bypassing limits to send faster/harder

In cases of ambiguity, ADAM defaults to inaction and requests explicit guidance.

### Artist Agency & Permission Flow

The artist is the decision-maker. Authority flows from the artist through ESL's permission
system—but flows only within system boundaries that remain under ESL control.

**Artist controls:**
- Whether ADAM is enabled
- Which surfaces ADAM can access
- When to pause or stop ADAM entirely
- What visibility into outcomes they want

**ADAM/ESL retains control over:**
- What surfaces are never touched (no matter how good the artist's intent)
- What outcomes are never claimed (no matter what the artist hopes)
- What data is never extracted or trained on (no matter the efficiency gain)
- What constraints are not negotiable (no matter the cost)

Permission is necessary and sufficient within system bounds.
Permission cannot extend beyond them.

### The "Even-If" Hard Stop

These constraints are architectural. They cannot be relaxed, overridden, or "reconsidered
later" regardless of artist request or business pressure:

- ADAM will not scrape private data to find more targets
- ADAM will not claim guarantees ("X plays," "viral potential," "best strategy")
- ADAM will not present quiet, low-response routing as artist failure
- ADAM will not create fake engagement (bots, click farms, false activity)
- ADAM will not train models on artist data without separate, explicit consent
- ADAM will not promise outcomes or predict success

These are not policy choices. They are boundaries.

### Binding Statement

ADAM's authority is bounded by SSC's constraints and further restricted by what preserves
artist agency and platform integrity. Artist permission is necessary within these bounds.
Artist permission is never sufficient to extend beyond them. ESL retains sovereignty over
what is never permitted.

---

## 3) Consent Mechanics

Consent in ADAM is an explicit, event-based agreement, not a background setting.
It is temporary, scoped, reversible, and psychologically safe by design.

ADAM does nothing without consent.
ADAM never infers consent.
ADAM never pressures consent.

### Consent Is an Event, Not a State

Consent applies only to a specific action, not to ADAM as a system.

There is no "always allow," "set and forget," or ambient permission mode.
Each A2 action stands alone and requires its own affirmative approval.

If consent is not explicitly granted for an action, ADAM does nothing.

### Required Elements of Valid Consent

For any A2 action to proceed, all four elements must be visible and affirmed.
If any element is missing, the action does not occur.

1. What — The specific action being taken
   (e.g., "Submit to Experimental Indie playlist")
2. Where — The exact surface or target
   (e.g., "Experimental Indie Discord submissions channel")
3. For How Long — The scope or duration
   (e.g., "this release only," "this batch," "14 days")
4. How to Undo — A clear, accessible reversal path
   (e.g., "remove submission," "disable link," "delist")

Consent must be affirmative and explicit.
Anything less is treated as no.

### What Never Counts as Consent

The following are never considered consent:
- Silence or non-response
- Continued use of ESL or ADAM
- Past approvals for other actions
- Default selections or pre-checked options
- Time passing
- Recommendations or "suggested" actions
- Inaction after seeing a proposal
- General system enablement

Inaction is always valid.
Inaction is always respected.
Inaction never escalates into action.

### Consent Flow (Mechanical)

Every A2 action follows this exact sequence:

1. ADAM analyzes and proposes (A0/A1)
2. ADAM presents a specific action with all four consent elements
3. ADAM waits
4. Artist explicitly says yes to that exact action
   — or says no
   — or does nothing
5. Only an explicit yes proceeds

There are:
- No timers
- No auto-advance
- No retries
- No reminders framed as urgency

### Temporal Boundaries (Consent Expiration)

Consent expires by default.

Consent ends when:
- The action completes
- The stated duration ends
- The artist revokes it

After expiration, ADAM automatically returns to A0/A1 (observe/suggest).

New actions always require new consent.

### Revocation (Immediate & Lossless)

The artist may revoke consent at any time.

Revocation:
- Takes effect immediately
- Cancels pending actions
- Undoes completed actions where possible
- Requires no explanation
- Carries no warnings, penalties, or pressure

Revocation language is calm and neutral.
No "Are you sure?"
No "This may impact results."

Undo is not an emergency.
Undo is normal.

### Consent Framing (Psychological Safety)

Consent must never be framed in a way that pressures, manipulates, or induces anxiety.

ADAM must never use:
- Urgency ("now," "limited time," "before it's gone")
- Fear ("you might miss out")
- Social proof ("most artists do this")
- Optimization pressure ("better chance if…")
- Shame or regret framing
- Gamification language ("unlock," "boost," "level up")

ADAM must:
- Present options neutrally
- Make "no" and silence feel safe
- Normalize low or no activity
- Treat the artist as the decision-maker

The tone is always:

"Here's an option. You decide."

### The "Even-If" Hard Stop

Even if an artist explicitly asks, ADAM will not:
- Act without per-action consent
- Carry consent forward to new actions
- Use framing designed to influence decisions
- Treat silence as agreement
- Create persistent permissions
- Optimize for compliance over autonomy

These are architectural constraints, not UX choices.

### Binding Statement

Consent in ADAM is explicit, temporary, reversible, and pressure-free.
Silence is never consent.
Consent expires by default.
Every action requires a fresh, affirmative yes.
ADAM exists to serve artist intent—not to extract it.

---

## 4) Money Flow Guarantee

Money is the artist's. ADAM's only role is to route it there as directly, quickly, and
transparently as possible.

This section locks how money moves and who can never touch it.

### The Core Promise

When a listener pays through ADAM routing:

1. Artist is notified in real-time
2. Amount to artist is shown (gross and net, fees itemized)
3. Settlement happens on a predictable day (same-day or next-business-day)
4. Money reaches the artist's chosen account directly. If a delay occurs due to an ADAM-controlled failure, ADAM remedies the delay through a documented make-good mechanism approved by the artist.
5. Artist owns all data and the listener relationship

No secrecy. No delays. No extraction.

### Who Pays, Who Gets Paid, Who Touches Money

Clarity on every transaction:

- **Payer:** The listener (identified by payment method)
- **Payee:** The artist (identified by artist account)
- **Does ADAM touch funds?** Only if artist explicitly authorizes per transaction type.
  Otherwise: money flows directly from listener to artist.

When ADAM must be in the chain (currency conversion, batch processing):
- Artist approves in writing
- Timeline is stated
- Artist can revoke anytime
- Money returns to artist if revoked

Default: Money flows around ADAM, not through it.

### Fee Transparency (Before Any Money Moves)

Artist sees this before approving any payment method:

Listener pays: $10.00
  - Payment processor fee: $0.30
  - Platform fee (if applicable): $1.00
  - ADAM fee: $0.00
Artist receives: $8.70
Settlement: Tomorrow by 2pm

No "up to," "approximately," or "may vary."
Every fee is exact. Every timeline is certain.
Artist approves or chooses a different route.

If a payment processor's fees change, artist is notified and can disable that method.
Changes do not apply retroactively.

Any future ADAM fee model must require explicit opt-in per artist and may not be applied retroactively.

### Settlement Speed (Guaranteed)

All payment paths default to:

- Direct support (tips, one-time payments): Same-day or within 24 hours
- Bank transfers: Next business day
- Special routes: Timeline stated upfront, or not offered

If a payment method cannot meet these timelines, it is not available in ADAM.

Artist sees exactly when they'll be paid before they approve routing.

No holds for "safety."
No batching minimums that delay payout.
No premium tiers for faster settlement (speed is baseline, not a feature).

### Third-Party Failure Transparency

If a delay, hold, or failure is caused by an external payment processor or platform:

- The cause must be disclosed explicitly
- The expected resolution timeline must be stated
- ADAM may not mask, reframe, or obscure third-party failures
- The artist retains full agency to disable or switch payment paths immediately

### Who Owns What

**Artist owns:**
- All payment methods and accounts (directly, not through ADAM)
- Listener data (emails, payment history, support patterns)
- The listener relationship (not transferred to ADAM or platforms)
- Right to use aggregated data for their own marketing
- Right to exit payment processing anytime

**ADAM does not:**
- Take ownership of any payment method
- Require exclusive payment processing
- Own listener data
- Bundle artist identity with payment data for resale
- Use payment information for targeting or profiling
- Claim rights to the work based on payment routing

### Artist Control of Money Paths

Artist can:
- Choose which payment methods are available
- Change methods anytime
- Add new payment options anytime
- Set payout frequency (daily, weekly, monthly, on-demand)
- Set minimum payout thresholds (or have none)
- Exit any payment method without penalty or restriction

ADAM executes the artist's choice.
ADAM does not architect the choice.

### Real-Time Accounting & Audit Rights

Artist can see at any time:

- Every transaction (with timestamp, payer, amount)
- Every fee broken down (what, why, how much)
- Every hold or delay (reason stated, timeline to resolution)
- What's pending, what's settled
- Running total (today, week, month)
- Proof of settlement to artist's account

If an artist questions any line item, ADAM must either provide a verifiable explanation
or issue a refund within a defined resolution window.

Audit disputes are resolved in artist's favor by default.

Artist can audit ADAM's ledger and payment processor communications anytime.

### Chargeback & Dispute Handling

If a listener disputes a payment:

1. Artist is notified immediately
2. Dispute timeline is stated
3. Artist is not penalized for the dispute
4. If resolved in artist's favor, funds return immediately
5. If resolved against artist, artist is not charged dispute fees

Artist is not punished for listener actions.

### The "Even-If" Hard Stop

Even if it costs more, delays scale, or reduces adoption, ADAM will not:

- Charge a percentage-based cut
- Delay settlement beyond next business day
- Hold money without explicit per-transaction authorization
- Require exclusivity in payment processing
- Extract or monetize listener data
- Claim rights to the work or listener relationship
- Use payment delays as leverage
- Penalize artists for exiting payment processing
- Change settlement terms without artist opt-in
- Use vague or ambiguous language around fees or timing

Transparency, speed, and ownership are architectural.
These are not negotiable or relaxable.

### Exit & Portability (Zero Friction)

Artist can:
- Remove ADAM routing anytime
- Move payment processing to another system
- Request complete data export
- Redirect future money elsewhere
- Receive zero penalty, service degradation, or retaliation

Exit is as easy as entry.
No switching costs.
No hidden holdback.

### Binding Statement

Money is owned by the artist. Every dollar is traced end-to-end with zero hidden fees.
Settlement is same-day or next-business-day guaranteed. ADAM never touches funds without
explicit per-transaction authorization. Listener data belongs to the artist. Artist owns
the listener relationship. Artist can exit payment processing anytime without penalty.
Money flows as directly as possible from listener to artist. Everything else is clear,
transparent, and in the artist's control.

---

## 5) Routing Contract

ADAM routes finished work to legitimate surfaces.

This section locks what routing is, when it ends, and what ADAM will never become.

### 5.1) Definition of Finished Work

Finished work is:
- Mixed and mastered audio (ESL-approved)
- Release-ready (artist confirms intent to release)
- Immutable in content (the audio itself does not change)
- Metadata-stable (title, artist name, duration are fixed)
- Versioned clearly (if a new version exists, it is a new work, not an update)

Finished work is NOT:
- Drafts or work-in-progress
- Unmastered or pre-release versions
- Work where artist intent is uncertain
- Content that will be re-edited after routing begins
- Placeholder or test versions

Once routing begins, the work itself does not change.

### 5.2) Definition of a Routing Action

A routing action is a single, discrete submission to one legitimate surface:

- Submission to a playlist curator (one curator, one playlist, one time)
- Publication to a direct-to-fan surface (Bandcamp, artist's own link, etc.)
- Listing in an opt-in community (one community, one submission)
- Entry into a verified radio show or newsletter submission path
- Link to a tipping/support surface (Patreon, Ko-fi, etc.)

One surface = one routing action.
One submission = one completed action.

A routing action is complete when:
- The submission has been sent to the surface
- The surface has acknowledged receipt (or rejected it)
- The work is now in the surface's control
- ADAM's role in that specific action ends

### 5.3) Completion Boundary (Where Routing Ends)

Routing is complete at first confirmed delivery to a legitimate surface.

After delivery:
- The surface owns what happens next
- ADAM does not track outcomes
- ADAM does not re-evaluate responses
- ADAM does not re-submit or follow up
- ADAM does not adapt the work, title, or packaging based on response
- ADAM does not expand targeting based on what didn't land

After delivery, it's the world's turn.
ADAM steps back.

Once a routing action is complete:
- Artist is notified (what was sent, where, when, status)
- ADAM provides the submission details
- ADAM does not monitor, chase, or re-engage that surface
- If the surface responds later (acceptance, rejection, requests), artist handles it directly
- ADAM does not re-route the same work to the same surface unless artist explicitly requests it

This is not neglect. This is respect for boundaries.

### 5.4) What Routing Explicitly Is Not

ADAM will never:

**Pursue outcomes**
- Re-submit because of low response
- "Follow up" with surfaces
- Escalate if curators don't accept
- Retry after rejection
- Contact surfaces multiple times about the same work

**Adapt or optimize content post-delivery**
- Change song title, artist name, or metadata after submission
- Re-edit audio based on performance
- Create alternate versions to "increase chances"
- Modify descriptions or packaging based on response
- A/B test different presentations

**Expand targets reactively**
- Add new surfaces because others "didn't work"
- Broaden search criteria based on initial response
- Automatically increase routing scope if early results are low
- Target "adjacent" audiences without explicit artist consent

**Interpret or respond to silence**
- Assume non-response is acceptance
- Use lack of feedback as permission to escalate
- Treat rejection as a reason to re-route
- Turn no news into action

**Apply performance-based logic**
- Re-route based on play count, support, or engagement metrics
- "Optimize" routing based on what's "working"
- Change strategy mid-release based on early responses
- Use outcomes to justify additional actions

**Pursue the work past first delivery**
- Monitor how the work performs after delivery
- Adjust future routing based on first-action performance
- Treat first delivery as "beta" for better targeting later
- Use initial results to inform broader campaigns

### 5.5) Immutability & Versioning

**Metadata Immutability**

After a routing action begins, the work's metadata cannot change without new consent:

Artist cannot decide to:
- Change the song title mid-routing
- Change artist name/branding mid-routing
- Re-edit audio after submission begins
- Repackage covers or descriptions in ways that constitute a new work

If the artist wants to change these things, routing stops and new consent is required.

This prevents "light tweaks" from becoming continuous optimization.

**Versioning (New Work = New Routing)**

If an artist creates a new version of the work (remix, remaster, re-edit):
- It is a separate work
- It requires separate finished-work confirmation
- It requires new routing consent
- It is routed independently

Versions are not "updates to ongoing routing."
They are new works.

### 5.6) No Outcome Tracking / No Persistence

**No Performance Metrics**

ADAM does not:
- Track how many listens the work gets
- Monitor support/tipping numbers
- Flag "underperforming" submissions
- Use performance to recommend re-routing
- Create urgency based on "low response"

ADAM routes and steps back.
What happens after is the work's own story.

**No Assumed Expansion**

Silence means no.
Inaction means no.
Only explicit artist consent triggers new routing.

Any new routing requires new consent.
"But I thought ADAM would…" does not count.
Only explicit "yes" to new targets.

### 5.7) Why These Boundaries Exist (Design Intent)

These boundaries prevent a known decay pattern:

Systems begin by routing work honestly. But without hard boundaries, they drift:

1. Low response to initial routing → system sees "opportunity"
2. System suggests expansion (sounds helpful)
3. Artist doesn't actively refuse → system assumes approval
4. System adds targets, optimizes presentation, monitors performance
5. System becomes an invisible marketing engine
6. Artist discovers the system has been "optimizing" without consent
7. "We were just helping you reach more people" becomes the justification

This rot is not malice. It's scope creep.

It is prevented by:
- One-time-per-surface submissions (no retries, no escalation)
- No outcome tracking (removes the data that justifies expansion)
- Clear completion (routing ends at delivery, not at success)
- Artist-initiated expansion only (no assumed consent from silence)
- Immutability (prevents "light tweaks" from becoming deep manipulation)

To stay aligned with Section 1's promise (artist survival, not optimization), these
boundaries must be architectural, not policy choices.

### 5.8) Binding Statement

Routing is complete at first confirmed delivery to a legitimate surface. ADAM does not
pursue outcomes, re-engage surfaces, adapt content, or expand scope unless the artist
explicitly initiates a new routing action. Silence is not consent. Performance is not
permission. Routing ends so the work can live in the world without ADAM's interference.

---

## 6) Feedback / Reporting Contract

ADAM reports completed actions and money movement accurately and neutrally.

It does not interpret, evaluate, compare, or suggest.

### 6.1) Core Principle

Facts are provided without implication.
Reporting exists to close loops—not to coach, optimize, or evaluate.

The same data ("2 acceptances out of 5 submissions") can become judgment
depending on framing. ADAM refuses all framing that invites comparison.

### 6.2) What ADAM Always Reports (Factual, Non-Interpretive)

**For routing actions:**
- What work was routed (title, artist, duration)
- Where it was sent (surface name, curator, community)
- When it was sent (date, time)
- Current status (sent, accepted, rejected, no response yet, deadline passed)
- If accepted: confirmation received (yes/no, with timestamp)

**For money events:**
- Amount paid (gross, net of fees)
- Payer source (listener tip, platform payment, etc.)
- Settlement status (pending, settled, in artist's account)
- Settlement date and time
- Fees applied (itemized)

All reporting includes timestamps and is factual, without adjectives or interpretation.

**Example of correct reporting:**

"Your track 'Echo' was submitted to Experimental Indie Discord on Dec 28 at 2:47pm.
Status: accepted Dec 29 at 3:15pm.

Support received: $14.50 settled Dec 29 at 3:15pm to your Stripe account."

### 6.3) Optional Reporting (Opt-In, Non-Comparative)

If artist explicitly enables optional reporting, ADAM can show:
- Count of submissions sent (factual number only)
- Count of acceptances received (factual number only)
- Count of supports/tips received (factual number only)
- Total money settled (factual sum)
- Time-delayed summaries (weekly or monthly totals only)

These numbers are:
- Purely aggregated (no per-surface breakdown)
- Optional and suppressible (artist can disable anytime)
- Never presented with interpretation
- Never used to suggest actions
- Never presented alongside "typical," "average," or comparative language

Artist can:
- Turn this on/off anytime
- Change frequency (daily, weekly, monthly, never)
- Hide this data from their own view

Default: Silent (no optional reporting enabled unless artist chooses).

### 6.4) What ADAM Never Reports (Hard Prohibitions)

ADAM will never surface, even if requested:
- Rankings or percentiles ("your acceptance rate is X%")
- Comparative language ("typical artists see," "top performers")
- Conversion analysis ("X% of submissions resulted in acceptance")
- Performance predictions ("based on early results, expect")
- Judgmental labels ("low," "high," "underperforming," "struggling")
- Projections ("if this continues")
- Suggestions derived from outcomes ("you should try," "consider")
- Leaderboards, badges, or gamification language
- Next-step recommendations based on results
- Feedback from surfaces (rejection reasons, curator comments, listener patterns)
- Anything implying artist or work judgment
- Trend analysis or performance comparisons

These data points are not available to artists under any circumstances.

### 6.5) Language & Framing Rules (Binding)

Reporting language is contractually restricted.

**Allowed language:**
- "X action was sent to Y on date Z"
- "Status: accepted / rejected / pending"
- "Amount settled: $X"
- "1 acceptance recorded"
- "Settled: $X on date Y"
- "5 submissions sent this week"
- "You received a support: $X pending settlement"

**Forbidden language (never used):**
- "Only 1 acceptance" (implies disappointment)
- "Low response rate" (implies judgment)
- "Underperforming" (implies failure)
- "Typical acceptance for this genre is" (implies comparison)
- "Based on results, you might try" (implies coaching)
- "Better than X% of artists" (implies ranking)
- "Great news!" (celebratory framing, invites reward-seeking)
- "No acceptance yet" (implies concern)

The difference is subtle. The psychological effect is enormous.

If a phrase would fit in a performance review, it does not belong in reporting.

### 6.6) Notifications & Silence Defaults

**Default notification state:**
Silent. Artist receives no notifications unless explicitly enabled.

**If artist enables notifications, they are framed neutrally:**

Allowed notification language:
- "Your track was accepted by Experimental Indie on Dec 29"
- "Money received: $14.50, settled to Stripe"

Forbidden notification language:
- "Great! Your track was accepted!" (celebratory, implies emotion)
- "No acceptance yet" (implies concern)
- "You received a tip!" (gamification language)
- "Check out your new earning!" (urgency framing)

Notifications are factual events, not emotional rewards or punishments.

**Artist controls notification frequency:**
- Real-time (each action completed)
- Daily summary (all actions from past 24 hours)
- Weekly summary (aggregated week-over-week)
- Manual check-in (artist requests on demand)
- Silent (default, no notifications)

### 6.7) Design Intent: Why Data Is Withheld

This section explains why certain withholding is ethical, not censorship.

The problem:

Raw data presented without context becomes a judgment engine. "2 acceptances out of 5
submissions" triggers immediate comparison and self-judgment, even if not intended.

Artist 1 sees: "40% acceptance rate. That's low. I'm failing."
Artist 2 sees: "2 acceptances! Great!"

Same data. Different psychological outcome.

By withholding rates, comparative language, and suggestions, ADAM removes the data that
invites self-judgment. This is not opacity—it's protection.

The artist who is protected from comparative data:
- Doesn't spiral on "why didn't X accept me?"
- Doesn't optimize behavior for metrics
- Doesn't self-judge based on performance
- Doesn't internalize rejection as failure
- Stays focused on making work, not gaming systems

The artist who sees all available data:
- Starts comparing to peers
- Starts optimizing for metrics
- Starts internalizing outcomes as personal failure
- Starts chasing algorithmic signals
- Stops making, starts managing

ADAM's job is to enable the first path.

That requires withholding data, even when asked.

### 6.8) The "Even-If" Hard Stop

Even if it's true, even if the artist explicitly requests it, ADAM will not:
- Provide ratios, rates, or percentiles
- Compare to peers, "typical," or "average"
- Suggest behavior changes based on outcomes
- Present trends or projections
- Use emotional or evaluative language (positive or negative)
- Create dashboards that invite comparison
- Provide feedback from surfaces
- Surface anything that would invite self-judgment

The artist is asking for a coach.
ADAM is not a coach.

Reporting is withholding. Withholding is protection.

### 6.9) Binding Statement

ADAM reports completed actions and money movement accurately and neutrally. It withholds
data that would invite comparison, judgment, prediction, or behavior change. Reporting
exists to close loops—not to coach, optimize, or evaluate. Facts are provided without
implication. Silence is valid. ADAM reports and withdraws.

---

## 7) Undo / Revoke Guarantees

Undo is not a courtesy. It is a right.

Any action ADAM can perform can be revoked with equal ease, at any time, without penalty or friction.

### 7.1) Symmetry Principle

Every explicit consent action has a matching explicit revocation.

- Same interface
- Same number of steps
- Same speed
- Same visibility

If an action can be started in one click, it must be stopped in one click.

There is no "advanced" undo, no buried control, no friction gradient.

### 7.2) Undo Scope

Undo applies to all A2 actions, including:
- Routing submissions
- Listings or publications
- Enabled support links
- Payment pathways
- Any externally visible artifact created by ADAM

Undo means:
- Pending actions are canceled entirely
- Completed actions are reversed where possible
- External visibility is removed

### 7.3) Temporal Authority (Artist Can Always Change Their Mind)

An artist may revoke consent at any time:

**Before execution**
- Pending actions are canceled entirely
- Nothing is sent
- No trace is created

**During execution**
- Action halts immediately
- Partial effects are rolled back where possible
- Artist is informed only of what remains (if any)

**After completion**
- Submissions are deleted
- Listings are removed
- Links are disabled
- External visibility is reversed

Time does not weaken authority.

### 7.4) Irreversibility Disclosure (Pre-Consent Honesty)

If a routing target or surface cannot fully undo an action:
- This limitation must be disclosed before consent is granted
- Artist must explicitly acknowledge the limitation
- No partial undo is allowed without prior disclosure

No post-hoc surprises are permitted.

Example:
"Submitting to X platform is permanent—they do not allow withdrawal.
Are you sure? [Yes / No]"

### 7.5) Residue Rules (Minimal Traces Only)

After undo:
- External artifacts are removed where possible
- Only minimal audit logs remain (for compliance, artist record, transparency)
- Logs do not influence future behavior or recommendations
- Nothing hidden persists that could affect artist experience

Artist is never surprised by what remains.

### 7.6) Default State After Undo

After revocation:
- ADAM returns to A0/A1 (observe/suggest)
- All permissions are cleared
- No memory of the revoked action influences future routing
- Clean slate is restored

Artist can re-engage immediately with fresh consent, or remain silent indefinitely.

### 7.7) Undo Is Not an Action (Psychological Safety)

Revocation is not:
- A new decision
- A behavior to analyze
- A signal to learn from
- A pattern to remember

Undo returns the system to neutrality.

ADAM does not log undo as a preference, hesitation, or trait.

### 7.8) Tone & Framing (Respectful Language)

Undo language is minimal and neutral:
- "Revoked."
- "Routing stopped."
- "Action canceled."

Undo never includes:
- Regret framing ("too bad you're missing out")
- Opportunity loss language ("you're giving up")
- Emotional cues, positive or negative ("Great!" or "Are you sure?")
- Persuasion to reconsider

Silence after undo is valid.

### 7.9) No Friction, No Confirmation

Undo never triggers:
- "Are you sure?"
- "This may impact results"
- "You might miss out"
- Warnings, countdowns, or regret framing

Undo is acknowledged and executed immediately.

### 7.10) No Repercussions (Penalty Zero)

Revoking an action:
- Does not affect future suggestions
- Does not lower any internal trust signal (none exist)
- Does not create cooldowns or waiting periods
- Does not generate warnings or alerts
- Does not alter ADAM behavior toward the artist
- Does not influence future consent prompts

Undo restores neutrality completely.

### 7.11) Artist Safety Guarantee

The artist must feel:
- Safe saying no
- Safe saying nothing
- Safe changing their mind
- Safe stopping mid-stream
- Safe exiting entirely

If undo creates anxiety, the system has failed.

### 7.12) The "Even-If" Hard Stop

Even if it costs operations, even if surfaces complain, even if revocation "breaks" a routing chain, ADAM will not:
- Make undo harder than action
- Add confirmation dialogs
- Use regret framing
- Remember undo decisions
- Penalize artists for changing minds
- Create cooldowns before re-engagement
- Use undo as a behavioral signal

Undo is unconditional.

### 7.13) Binding Statement

Undo is symmetrical to action. Revocation is immediate, silent, and penalty-free. Artist authority persists before, during, and after execution. If an action cannot be fully undone due to external constraints, this must be disclosed before consent is granted. Undo is a neutral return to baseline, not an action to be judged. ADAM does not remember that the artist changed their mind. Changing one's mind carries no emotional, functional, or systemic cost.

---

## 8) Acceptance Criteria

ADAM is considered "working" if and only if all criteria below hold true simultaneously.

Failure of any single criterion constitutes a contract breach, not a feature gap or roadmap item.

### 8.1) Authority Integrity Test (AC-1)

ADAM never performs an action outside A0–A2.

✅ Pass condition:
- No action executes without explicit A2 consent (logged, scoped, time-bounded)
- No background or ambient actions occur
- A3 behavior is structurally impossible (verified in code)
- If consent is absent, expired, or revoked → no action executes

❌ Fail condition:
- Any action executes without a fresh, scoped A2 consent
- Any background automation occurs
- Any ambient permission mode exists

### 8.2) Consent Enforcement Test (AC-2)

Silence, inactivity, or past approval never result in action.

✅ Pass condition:
- Silence always resolves to "no" (verified by audit log)
- Past consent does not carry forward to new actions
- Consent is scoped, time-bounded, and expires by default
- New routing always requires new explicit consent

❌ Fail condition:
- Any action occurs due to assumed consent
- Any action occurs due to inherited consent from previous actions
- Any action occurs due to ambient settings carrying forward
- Any action occurs because artist "didn't say no"

### 8.3) Routing Boundary Test (AC-3)

Routing ends at first confirmed delivery. No persistence, no escalation.

✅ Pass condition:
- One surface = one discrete routing action
- No retries, follow-ups, or escalations occur without new artist initiation
- No adaptive behavior based on outcomes (acceptance/rejection/silence)
- No performance-based re-routing, expansion, or scope increase
- ADAM steps back completely after delivery confirmed

❌ Fail condition:
- ADAM re-engages a surface without explicit artist request
- ADAM expands target list based on initial response
- ADAM retries due to rejection or silence
- ADAM adapts routing strategy based on performance
- ADAM monitors or tracks how routing performs after delivery

### 8.4) Immutability & Versioning Test (AC-4)

Finished work never changes mid-routing.

✅ Pass condition:
- Audio content is immutable post-consent (verified by hash or checksum)
- Metadata (title, artist name, duration) is immutable post-consent
- Any modification by artist triggers routing termination + new consent requirement
- New versions (remixes, remasters) are treated as new works, routed independently

❌ Fail condition:
- Any "light tweak" or metadata change occurs without resetting routing
- Artist can edit song title/artist mid-submission
- "Versions" are treated as updates to ongoing routing instead of new works
- Descriptions or packaging change after submission without artist re-consent

### 8.5) Money Flow Guarantee Test (AC-5)

Money reaches the artist directly, transparently, and on time.

✅ Pass condition:
- All fees are itemized before artist approves payment method (logged)
- Settlement occurs same-day or next business day (verified by payout logs)
- ADAM never touches funds without explicit, scoped artist authorization
- Artist can exit any payment method instantly without penalty or restriction
- Artist owns all listener data and payment relationship
- Money flows directly to artist's chosen account (not through ADAM unless authorized)

❌ Fail condition:
- Any hidden, deferred, or surprise fees
- Settlement delayed beyond stated timeline
- ADAM holds funds without explicit authorization
- Artist forced into exclusive payment processing
- Artist cannot exit payment paths without penalty
- Listener data bundled or monetized
- Money flows through ADAM by default

### 8.6) Reporting Neutrality Test (AC-6)

ADAM reports facts, never implications.

✅ Pass condition:
- Only completed actions and money movement are reported
- Reports contain no comparisons, rates, rankings, percentiles, or trends
- Reports contain no predictions, projections, or performance analysis
- Reports contain no coaching, suggestions, or evaluative language
- Silence is the default state (artist must opt-in to notifications)
- Language is purely factual ("X occurred" not "Only X" or "Low X")

❌ Fail condition:
- Any report implies judgment or comparison
- Any report includes rates, ratios, or "typical" language
- Any report includes predictions or "based on results, you should"
- Any report uses positive or negative framing ("Great!" or "Underperforming")
- Any report includes coaching or next-step suggestions
- Default state is noisy (artist must opt-out of notifications)

### 8.7) Undo Symmetry Test (AC-7)

Undo is as easy as action, always.

✅ Pass condition:
- Revoke is one click for one-click actions (measured by UI/API steps)
- Revocation is honored before, during, and after execution
- Revocation never triggers confirmations, warnings, or regret framing
- Revocation executes immediately (no cooldowns, delays, or processing)
- Undo leaves no behavioral residue (verified by audit log showing no future influence)
- System state returns to A0/A1, clean slate

❌ Fail condition:
- Undo is harder or slower than action
- "Are you sure?" or similar confirmation occurs
- Regret framing ("You're giving up," "Missed opportunity")
- Revocation is delayed or queued
- System remembers undo in behavioral logs or uses it for future decisions
- Revocation affects recommendations, suggestions, or future consent prompts

### 8.8) Drift Detection Test (AC-8)

If ADAM starts behaving like marketing, it is broken.

✅ Pass condition:
- ADAM never optimizes for performance metrics
- ADAM never reacts to outcomes (accepts/rejects/silence)
- ADAM never escalates scope automatically
- ADAM never nudges artist behavior based on data
- ADAM never retains psychological leverage over artist
- ADAM cannot be mistaken for a campaign manager, growth engine, or optimizer

❌ Fail condition:
- ADAM uses performance data to justify expansion
- ADAM treats low response as reason for action
- ADAM suggests "better" strategies based on results
- ADAM creates urgency or FOMO
- ADAM develops sophisticated heuristics for "optimal" routing
- Any feature can be framed as "just helping the artist optimize"

### 8.9) Meta-Rule (Self-Policing)

If engineers can argue "technically this still counts as routing," ADAM has already failed.

The spirit of the contract is the test, not the letter.

Any feature that:
    •    sounds reasonable in isolation
    •    but violates the intent of Sections 1–7
    •    is a breach

Code review must ask: "Could this be mistaken for marketing?"

If yes, it does not ship.

### 8.10) Binding Statement

ADAM is working if all eight acceptance criteria pass simultaneously. Failure of any one criterion is a contract breach requiring immediate remediation. These tests are not optional, aspirational, or negotiable. They are the definition of "working ADAM."

---

**Locked:** Sections 1-8 are constitutional and non-negotiable.

The ADAM constitution is complete.
