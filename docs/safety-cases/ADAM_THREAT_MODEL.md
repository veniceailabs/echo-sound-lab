# ADAM Threat Model (MVP)

Status: Locked (MVP)

Subsystem: ADAM — Artist Development Assistant Mechanism
Parent: ESL ("The Ark")
Related: SSC_MVP_CONTRACT.md (authority/intent constraints)

---

## Keystone

ADAM is **water, not a flood**.

ADAM must never become:
- a spam cannon
- a coercive "growth machine"
- a value-extraction layer
- a policy-evasion bot
- a psychological harm engine

ADAM exists to **route finished art into existing attention and immediate livelihood** with:
- minimal artist labor
- explicit consent
- reversible outcomes
- truthful reporting

ADAM routes art; it does not optimize artists.

---

## 0) Scope (What ADAM is allowed to do)

ADAM is a **circulation + livelihood assistant**. It:
- packages content for distribution
- proposes/executes routing to *legitimate surfaces*
- enables *direct-to-fan* support and "same-day" earning paths
- reports outcomes calmly

ADAM is NOT:
- a popularity judge
- a fame predictor
- a manipulative optimizer
- a scraper
- a botnet

---

## 1) Authority Model (Must match SSC principles)

ADAM operates under explicit authority levels:

### A0 — Observe
- Can analyze the work (metadata, sonic fingerprint, assets)
- Can generate "routing plans" and explain them

### A1 — Suggest
- Can recommend routing targets + packaging
- Can explain tradeoffs and uncertainty

### A2 — Act (Explicit Grant Required)
- Can submit/send/publish only after:
  - artist grants action scope
  - scope is logged
  - undo path is defined

### A3 — Intentionally Impossible (MVP)
ADAM will not:
- scrape private data
- imitate humans to bypass platform rules
- buy traffic
- create fake engagement
- mass-email strangers
- message people who didn't opt-in

---

## 2) Truth & Language Requirements (Non-negotiable)

ADAM must communicate with:
- probabilistic language ("may", "likely", "possible")
- no guarantees of outcomes ("will go viral" forbidden)
- no moral judgment ("good/bad song" forbidden)
- no competitive ranking of artists ("top 1%" forbidden)

ADAM can say:
- "This is a high-fit niche match based on X/Y/Z."
- "Expected outcome range: low/medium/high uncertainty."

ADAM cannot say:
- "Do this to succeed."
- "Your song is better than…"
- "This is the best strategy."

---

## 3) Key Threats and Mitigations

### T1 — Spam / Over-Circulation (Flood Risk)

**Threat:**
- artists/bots try to blast everything everywhere
- ADAM becomes a distribution cannon

**Mitigations:**
- Hard velocity caps (per hour/day/week)
- Selective-by-design routing (small, high-fit sets)
- "Finish-state integrity gate" (only routes completed works)
- Per-surface quotas + cooldowns
- Duplicate detection + suppression (same asset, same target)

**MVP Rules:**
- No "send everywhere" mode
- No uncontrolled loops
- No automated retries that increase aggressiveness

---

### T2 — Coercive Growth Pressure (Addiction Risk)

**Threat:**
- ADAM nudges creators into algorithm worship
- "optimization anxiety" replaces creation

**Mitigations:**
- No leaderboards
- No ranks, scores, or "creator grades"
- No streak mechanics
- No "you would earn more if…" language
- Quiet defaults: reporting is calm, optional, and minimal

**MVP Rules:**
- ADAM reports events, not judgments
- Artists can opt out of visibility into metrics

---

### T3 — Economic Exploitation (Extraction Risk)

**Threat:**
- middlemen capture value
- ADAM becomes a toll booth
- ownership tricks appear

**Mitigations:**
- Direct-to-fan (D2F) only paths in MVP
- Transparent money routes ("where it went, fees, settlement timing")
- No forced exclusivity
- No rights transfer embedded in routing
- Clear "who gets paid" and "when" before any action

**MVP Rules:**
- ADAM cannot publish any link that changes ownership terms without explicit artist approval
- ADAM cannot bundle artist identity/data for resale

---

### T4 — Platform Retaliation / Policy Risk (Adversarial Risk)

**Threat:**
- platforms classify ADAM as abusive automation
- bans, blocks, or legal headaches
- reputational risk for the artist

**Mitigations:**
- No scraping
- No policy evasion
- Use public submission paths / official APIs / explicit opt-in surfaces only
- Human-in-the-loop where required
- Rate-limited, respectful usage patterns
- Surface compliance notes ("This target requires manual submit")

**MVP Rules:**
- ADAM must be "platform-clean": behaves better than humans do manually
- If a surface forbids automation, ADAM must stop and ask

---

### T5 — Psychological Harm (Human Risk)

**Threat:**
- self-worth becomes tied to routing outcomes
- shame loops from "low response"
- artists spiral

**Mitigations:**
- No comparison to other artists
- No predictions of fame
- No grading
- Silence is allowed: "No response" is treated as normal
- Negative feedback is never surfaced by default
- Opt-in only for critical feedback collection

**MVP Rules:**
- ADAM cannot present outcomes as personal failure
- ADAM must normalize uncertainty and randomness
- No activity is a valid outcome.

---

## 4) Abuse Prevention / Safety Rails (System-wide)

- Identity + reputation controls for outbound actions (when A2 exists)
- Strong audit trail (what/when/where/why)
- Undo path for every action (delete/unlist/revoke) where possible
- User-controlled "kill switch" (pause all routing)
- Sandbox mode (simulate routing without executing)

---

## 5) Data & Privacy

- Minimize what leaves device/system
- No selling personal data
- ADAM outputs are not used to train models without explicit, revocable consent
- Store only what's needed for:
  - auditability
  - undo
  - support accounting
- Respect creator privacy by default:
  - public routing does not imply public identity exposure unless artist chooses

---

## 6) Acceptance Criteria (MVP)

ADAM MVP passes if:
- it routes without spam behavior
- it never pressures creators into growth games
- it keeps money paths transparent and creator-owned
- it stays policy-clean (no scraping/evasion)
- it protects creator psychology (no grading/comparison)
- every action is consented, logged, and reversible

---

## 7) Intentionally Impossible (Hard No List)

ADAM will never:
- scrape private profiles or DMs
- bypass rate limits or anti-bot systems
- generate fake engagement (click farms, view bots)
- impersonate people to submit content
- auto-contact individuals without opt-in
- claim guaranteed outcomes

---

## 8) Assumptions

- ADAM operates with explicit artist consent and agency
- Routing targets are legitimate, opt-in surfaces
- Finished work meets ESL release-readiness standards
- Platform policies are respected as constraints, not obstacles to evade
- Creators understand their own needs better than ADAM does

---

## 9) Non-Goals (MVP)

- Predicting success or failure
- Replacing artist judgment with algorithmic optimization
- Autonomous background agents
- Persistent or hidden control sessions
- Growth hacking or viral mechanics

---

## 10) Future Work (Out of MVP)

- Event 1: post-support feedback loop (carefully, opt-in)
- Multi-artist collaborations + mutual routing (consent-aware)
- Surface adapters (official APIs only)
- Regional compliance additions

---

**Locked:** This threat model is the guardrail for every ADAM feature.
Any feature that violates it is a bug, not a roadmap item.
