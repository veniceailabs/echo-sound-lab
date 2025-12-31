# Phase 1 Policy ↔ Code Alignment (APL / ANME)

**Purpose:** Map Phase 1 policy statements to actual runtime enforcement. This is a documentation checksum only.

**Status:** Phase 1 code is correct as-is. Enforcement addendum is normative. APL runtime does not automatically enforce policy-only rules unless explicitly stated below.

---

## Policy-Only Boundaries (Not Runtime-Enforced)

Each item below is **defined as policy** and **enforced by consumer discipline**, not by APL runtime.

- **Session duration reset (30 minutes)**
  - Defined as policy; enforced by consumer discipline, not APL runtime.

- **Wall-clock inactivity reset (15 minutes without frames)**
  - Defined as policy; enforced by consumer discipline, not APL runtime.

- **Stale data semantics (5s threshold + halved confidence)**
  - Defined as policy; enforced by consumer discipline, not APL runtime.

- **Missing confidence default = 0.1**
  - Defined as policy; enforced by consumer discipline, not APL runtime.

- **Logging content expectations (avoid persistence of sensitive APL-derived data)**
  - Defined as policy; enforced by integrator discipline, not APL runtime.

- **Session boundary invariants beyond explicit start/stop inputs**
  - Defined as policy; enforced by consumer discipline, not APL runtime.

---

## Runtime-Enforced Boundaries (APL / ANME Code)

The following are enforced by current Phase 1 code:

- APL outputs are read-only, advisory, and immutable (dev-only frozen payloads).
- APL payloads reject functions, promises, and class instances (dev-only invariants).
- APL consumer surface is read-only and allowlisted (dev-only guards + freeze).
- ANME read-only consumption includes confidence gating and mutation guards (dev-only).
- No control or lifecycle methods are exposed through aplConsumer.

---

## Explicit Non-Implication

Policy-only boundaries are not automatically enforced by APL runtime. Compliance is required by ANME and integrators. No policy statement should be interpreted as a runtime guarantee unless explicitly listed under Runtime-Enforced Boundaries.
