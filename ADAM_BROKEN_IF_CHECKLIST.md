# ADAM Is Broken If…

**Developer Enforcement Checklist**

A one-page reference for code review and testing. If any of these conditions are true, ADAM has breached the contract. This is not a roadmap. It is a hard stop.

---

## AC-1: Authority Integrity (A0–A2 Only)

❌ ADAM is broken if:
- Any action executes without explicit A2 consent (logged, scoped, time-bounded)
- Background or ambient actions occur without per-action consent
- A3 behavior (autonomous action without consent) is possible
- Expired or revoked consent is not checked before execution
- Consent is inferred from system state instead of explicit per-action grant

**Test:** Run a routing submission. Verify audit log shows explicit artist consent with timestamp, scope, and undo path before action. Verify A3 is impossible (no code paths lead to it).

---

## AC-2: Consent Enforcement (Silence = No)

❌ ADAM is broken if:
- Any action occurs because artist didn't explicitly say yes
- Silence, inactivity, or non-response is treated as consent
- Past consent carries forward to new actions
- Consent persists beyond stated duration
- Default permission states exist

**Test:** Disable consent for a surface. Verify ADAM does not route there. Enable consent. Verify routing works. Disable again. Verify no background retry occurs. Check audit log: only explicit "yes" events exist.

---

## AC-3: Routing Boundary (First Delivery = Stop)

❌ ADAM is broken if:
- ADAM retries a surface after rejection
- ADAM re-engages a surface without explicit artist request
- ADAM tracks, monitors, or reacts to submission outcomes
- Routing scope expands based on performance (low response, silence, rejection)
- ADAM adapts content, title, or metadata based on response

**Test:** Submit to a surface. Verify submission is logged. Verify no follow-up occurs. Check audit log: only one submission event per surface per work. Verify no performance tracking data is collected post-delivery.

---

## AC-4: Immutability & Versioning (Work Doesn't Change)

❌ ADAM is broken if:
- Artist can change song title/metadata mid-submission without resetting routing
- Audio content changes after consent without triggering re-consent
- "Light tweaks" or "versions" are treated as updates to ongoing routing
- Metadata is mutable after routing begins
- Hash/checksum verification is missing

**Test:** Start routing. Try to change title. Verify routing halts and requires new consent. Create a remix. Verify system treats it as a new work. Check metadata immutability via hash before/after.

---

## AC-5: Money Flow (Direct, Transparent, On-Time)

❌ ADAM is broken if:
- Any hidden, deferred, or surprise fees exist
- Settlement is delayed beyond stated timeline (same-day or next business day)
- ADAM holds funds without explicit per-transaction authorization
- Artist is forced into exclusive payment processing
- Artist cannot exit payment methods without penalty
- Money flows through ADAM by default (not to artist's chosen account)
- Listener data is bundled, monetized, or owned by ADAM
- Fees are not itemized before artist approves payment method

**Test:** Simulate a payment. Verify fee breakdown is shown before approval. Verify artist sees exact settlement date. Verify money reaches artist's account on time. Check audit log: no funds held without explicit authorization. Verify artist can enable/disable payment methods instantly.

---

## AC-6: Reporting Neutrality (Facts Only)

❌ ADAM is broken if:
- Any report includes rates, percentiles, or ratios ("40% acceptance rate")
- Comparative language exists ("typical," "average," "top performers")
- Predictions or projections appear ("based on early results, expect")
- Evaluative or judgment language appears ("low," "high," "underperforming")
- Coaching or suggestions are present ("you should try," "consider")
- Default notification state is noisy (artist must opt-out instead of opt-in)
- Celebratory or emotional framing is used ("Great!", "Awesome!")

**Test:** Check reporting UI. Verify only factual language: "X accepted," "Y settled," timestamps. Verify no comparative data. Verify notifications default to silent. Verify opt-in controls exist and work.

---

## AC-7: Undo Symmetry (One Click Both Ways)

❌ ADAM is broken if:
- Undo is harder or slower than the original action
- Confirmation dialogs ("Are you sure?") block revocation
- Regret framing appears ("You're giving up," "Missed opportunity")
- Revocation is delayed, queued, or asynchronous
- System remembers revocation in behavioral logs or uses it for future decisions
- Revocation affects recommendations, suggestions, or future consent prompts
- Revocation creates cooldowns, waiting periods, or warnings

**Test:** Start a one-click action. Verify you can revoke in one click. Verify no confirmation dialog. Verify revocation is immediate. Check audit log: revocation is logged but doesn't influence future behavior. Verify system returns to A0/A1 state (clean slate).

---

## AC-8: Drift Detection (Not Marketing)

❌ ADAM is broken if:
- ADAM uses performance data to justify expansion
- ADAM treats low response as reason for automatic action
- ADAM suggests "better" strategies based on results
- ADAM creates urgency or FOMO ("check this before it's gone")
- ADAM develops heuristics for "optimal" routing
- Any feature can be rationalized as "just helping the artist optimize"
- ADAM reacts to outcomes (accepts/rejects/silence) by changing behavior

**Test:** Submit a work with low response. Verify ADAM does not auto-escalate, suggest expansion, or re-route. Check code: no performance metrics influence routing decisions. Ask: "Could this feature be mistaken for marketing?" If yes, it fails.

---

## AC-9: Meta-Rule (Spirit Over Letter)

❌ ADAM is broken if:
- Engineers argue "technically this still counts as routing" for a feature that violates intent
- A feature sounds reasonable in isolation but violates Sections 1–7
- Code review passes a feature without asking: "Could this be mistaken for marketing?"

**Test:** Code review must explicitly ask the spirit question. If yes to "marketing," the feature does not ship, regardless of technical compliance.

---

## Quick Test: The "Could This Be Marketing?" Question

Before any feature ships, ask:

**"If I showed this feature to someone unfamiliar with ADAM, could they mistake it for a marketing engine, growth optimizer, or campaign manager?"**

If the answer is yes:
- ❌ It fails AC-8
- ❌ It fails the meta-rule
- ❌ It does not ship

If the answer is no:
- ✅ It probably passes
- ✅ Proceed with other tests

---

## Enforcement Notes

1. **All eight criteria must pass simultaneously.** Failure of one criterion is a contract breach.
2. **These are not aspirational.** They are the definition of "working ADAM."
3. **Audit logs are primary evidence.** If a condition isn't logged, it didn't happen.
4. **Verify code structure, not just behavior.** A3 must be impossible, not just "unlikely."
5. **Test revocation paths explicitly.** Undo must be as easy as action.
6. **Check psychological framing, not just technical compliance.** Language and tone matter.

---

**Status:** This checklist is locked with ADAM_CONTRACT.md (Sections 1-8).

**Use:** Print this. Tape it to your screen during ADAM development. Reference it in every code review. If any condition is true, stop. The feature does not ship until it's resolved.
