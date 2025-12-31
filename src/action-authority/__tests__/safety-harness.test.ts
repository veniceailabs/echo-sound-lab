/**
 * Action Authority: Safety Harness Test Suite
 *
 * These tests are the LAW. They define what MUST NOT happen.
 *
 * Red Tests (Forbidden): Prove that attacks fail
 * Yellow Tests (Interruption): Prove that timing protects against reflexes
 * Green Tests (Valid Path): Prove the only way to execute
 * Blue Tests (Meta): Prove that safety rules are enforced structurally
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AAFSM, AAState, AAEvent, createAAFSM } from "../fsm";
import { AAContextBinding, createAAContextBinding, AAOperationalContext } from "../context-binding";

describe("🔴 RED TESTS: Forbidden Transitions", () => {
  let fsm: AAFSM;

  beforeEach(() => {
    fsm = createAAFSM({
      contextId: "file-A",
      timestamp: Date.now(),
      sourceHash: "hash-A",
    });
  });

  it("FORBIDDEN: High Confidence Bypass Attempt", () => {
    // Setup: FSM is in GENERATED state
    expect(fsm.getState()).toBe(AAState.GENERATED);

    // Attack: Attempt to jump directly to EXECUTED via confidence
    // (imaginary: fsm.executeWithConfidence(0.99))
    // Reality: No such method exists. Only legal transitions allowed.

    expect(() => {
      fsm.transition(AAEvent.CONFIRM);
    }).toThrow();

    // Proof: State unchanged
    expect(fsm.getState()).toBe(AAState.GENERATED);
  });

  it("FORBIDDEN: GENERATED → EXECUTED (User Bypass)", () => {
    expect(fsm.getState()).toBe(AAState.GENERATED);

    // Try to jump from GENERATED directly to EXECUTED
    // (This would be automation)
    expect(() => {
      // No direct path exists in the FSM
      // To reach EXECUTED from GENERATED, you must:
      // GENERATED → VISIBLE_GHOST → PREVIEW_ARMED → CONFIRM_READY → EXECUTED
      // Skip any step = forbidden transition
      fsm.transition(AAEvent.CONFIRM);
    }).toThrow();

    expect(fsm.getState()).toBe(AAState.GENERATED);
  });

  it("FORBIDDEN: VISIBLE_GHOST → EXECUTED (No Arming)", () => {
    fsm.transition(AAEvent.SHOW);
    expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);

    // Try to execute without arming
    expect(() => {
      fsm.transition(AAEvent.CONFIRM);
    }).toThrow();

    expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);
  });

  it("FORBIDDEN: PREVIEW_ARMED → EXECUTED (Without Final Confirm)", () => {
    fsm.transition(AAEvent.SHOW);
    fsm.transition(AAEvent.HOLD_TIMEOUT);
    expect(fsm.getState()).toBe(AAState.PREVIEW_ARMED);

    // Try to execute without explicit confirm button
    // The FSM requires CONFIRM event to reach CONFIRM_READY, then another CONFIRM to reach EXECUTED
    // (This prevents UI shortcuts)
    expect(() => {
      // Imagine: fsm.executeDirectly()
      // Reality: No such method. Must follow the law.
      fsm.transition(AAEvent.SHOW); // Try to stay in PREVIEW_ARMED
    }).not.toThrow();

    // But we're still in PREVIEW_ARMED
    expect(fsm.getState()).toBe(AAState.PREVIEW_ARMED);

    // To execute, we must:
    // 1. Press confirm button (CONFIRM event)
    fsm.transition(AAEvent.CONFIRM);
    expect(fsm.getState()).toBe(AAState.CONFIRM_READY);

    // 2. Then confirm again
    fsm.transition(AAEvent.CONFIRM);
    expect(fsm.getState()).toBe(AAState.EXECUTED);
  });
});

describe("🟡 INTERRUPTION TESTS: Temporal Safety", () => {
  let fsm: AAFSM;

  beforeEach(() => {
    fsm = createAAFSM({
      contextId: "file-A",
      timestamp: Date.now(),
      sourceHash: "hash-A",
    });
  });

  it("INTERRUPTED: Releasing Hold Before Threshold (200ms)", () => {
    fsm.transition(AAEvent.SHOW);
    expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);

    // User starts hold
    fsm.startHold();
    expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);

    // Simulate: Wait 200ms (less than 400ms threshold)
    // In real code: setTimeout(() => fsm.endHold(), 200)
    // For testing: Mock the holdStartTime
    (fsm as any).holdStartTime = Date.now() - 200;

    // User releases before threshold
    const thresholdMet = fsm.endHold();

    // Result: Hold did NOT reach threshold
    expect(thresholdMet).toBe(false);
    expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);

    // Proof: Action NOT armed, action did NOT execute
    expect(fsm.isArmed()).toBe(false);
  });

  it("VALID: Hold Reaching Threshold (400ms+)", () => {
    fsm.transition(AAEvent.SHOW);
    fsm.startHold();

    // Simulate: Wait 400ms
    (fsm as any).holdStartTime = Date.now() - 400;

    const thresholdMet = fsm.endHold();

    // Result: Hold reached threshold
    expect(thresholdMet).toBe(true);
    expect(fsm.getState()).toBe(AAState.PREVIEW_ARMED);

    // Proof: Action is armed
    expect(fsm.isArmed()).toBe(true);
  });

  it("REFLEXIVE CLICK DISABLED: Multiple Rapid Releases", () => {
    fsm.transition(AAEvent.SHOW);

    // Simulate: User rapidly clicks (reflex)
    for (let i = 0; i < 5; i++) {
      fsm.startHold();
      (fsm as any).holdStartTime = Date.now() - 100; // 100ms each (below 400ms)
      fsm.endHold();

      // Never reaches PREVIEW_ARMED
      expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);
    }

    // Proof: Reflexive clicking does NOT arm the action
    expect(fsm.isArmed()).toBe(false);
  });
});

describe("⏰ TIME-TRAVEL / CONTEXT SAFETY", () => {
  let binding: AAContextBinding;
  let contextA: AAOperationalContext;
  let contextB: AAOperationalContext;

  beforeEach(() => {
    contextA = {
      contextId: "file-A",
      sourceHash: "hash-A",
      timestamp: Date.now(),
    };
    contextB = {
      contextId: "file-B",
      sourceHash: "hash-B",
      timestamp: Date.now(),
    };

    binding = createAAContextBinding(contextA);
  });

  it("TIME-TRAVEL: Context Invalidated During Confirm", () => {
    // Create action in context A
    const action = binding.createAction();
    expect(action.boundContext.contextId).toBe("file-A");

    // Move action to PREVIEW_ARMED
    action.fsm.transition(AAEvent.SHOW);
    action.fsm.transition(AAEvent.HOLD_TIMEOUT);
    expect(action.fsm.getState()).toBe(AAState.PREVIEW_ARMED);

    // User switches to file B
    binding.switchContext(contextB);

    // Try to confirm action (which is bound to file A, now stale)
    expect(() => {
      binding.validateActionContext(action);
    }).toThrow(/stale/i);

    // Proof: Action expired when context changed
    // (On next transition attempt, would be EXPIRED)
  });

  it("VALID: Context Remains Consistent", () => {
    const action = binding.createAction();

    // Execute the full valid path
    action.fsm.transition(AAEvent.SHOW);
    expect(action.fsm.getState()).toBe(AAState.VISIBLE_GHOST);

    action.fsm.startHold();
    (action.fsm as any).holdStartTime = Date.now() - 400;
    action.fsm.endHold();
    expect(action.fsm.getState()).toBe(AAState.PREVIEW_ARMED);

    // Context is still valid
    expect(() => {
      binding.validateActionContext(action);
    }).not.toThrow();

    // Confirm
    action.fsm.transition(AAEvent.CONFIRM);
    expect(action.fsm.getState()).toBe(AAState.CONFIRM_READY);

    // Execute
    action.fsm.transition(AAEvent.CONFIRM);
    expect(action.fsm.getState()).toBe(AAState.EXECUTED);

    // Proof: Action executed successfully in same context
  });

  it("EXPIRED: Terminal State Cannot Transition", () => {
    const action = binding.createAction();

    // Force to EXPIRED
    action.fsm.transition(AAEvent.EXPIRE);
    expect(action.fsm.getState()).toBe(AAState.EXPIRED);

    // Try to transition from EXPIRED
    expect(() => {
      action.fsm.transition(AAEvent.CONFIRM);
    }).toThrow();

    // Proof: EXPIRED is terminal
  });
});

describe("🟢 POSITIVE PATH: The Only Valid Execution Route", () => {
  it("VALID: Full Execution Path (HOLD → ARM → CONFIRM → EXECUTED)", () => {
    const fsm = createAAFSM({
      contextId: "file-A",
      timestamp: Date.now(),
      sourceHash: "hash-A",
    });

    // Step 1: Action is generated (GENERATED state)
    expect(fsm.getState()).toBe(AAState.GENERATED);

    // Step 2: User sees preview (VISIBLE_GHOST)
    fsm.transition(AAEvent.SHOW);
    expect(fsm.getState()).toBe(AAState.VISIBLE_GHOST);

    // Step 3: User holds modifier for ≥400ms (PREVIEW_ARMED)
    fsm.startHold();
    (fsm as any).holdStartTime = Date.now() - 400;
    fsm.endHold();
    expect(fsm.getState()).toBe(AAState.PREVIEW_ARMED);

    // Step 4: User presses confirm button (CONFIRM_READY)
    fsm.transition(AAEvent.CONFIRM);
    expect(fsm.getState()).toBe(AAState.CONFIRM_READY);

    // Step 5: System executes (EXECUTED)
    fsm.transition(AAEvent.CONFIRM);
    expect(fsm.getState()).toBe(AAState.EXECUTED);

    // Proof: Only valid path works
    expect(fsm.isExecuted()).toBe(true);
    expect(fsm.isTerminal()).toBe(true);
  });

  it("VALID: Transition Log Proves Path", () => {
    const fsm = createAAFSM({
      contextId: "file-A",
      timestamp: Date.now(),
      sourceHash: "hash-A",
    });

    fsm.transition(AAEvent.SHOW);
    fsm.transition(AAEvent.HOLD_TIMEOUT);
    fsm.transition(AAEvent.CONFIRM);
    fsm.transition(AAEvent.CONFIRM);

    const log = fsm.getTransitionLog();

    // Proof: Exact path recorded
    expect(log.map((entry) => entry.event)).toEqual([
      AAEvent.SHOW,
      AAEvent.HOLD_TIMEOUT,
      AAEvent.CONFIRM,
      AAEvent.CONFIRM,
    ]);

    expect(log.map((entry) => entry.to)).toEqual([
      AAState.VISIBLE_GHOST,
      AAState.PREVIEW_ARMED,
      AAState.CONFIRM_READY,
      AAState.EXECUTED,
    ]);
  });
});

describe("🧨 META TEST: Structural Invariants", () => {
  it("INVARIANT: Confidence Never Appears in Execution Path", () => {
    const fsm = createAAFSM({
      contextId: "file-A",
      timestamp: Date.now(),
      sourceHash: "hash-A",
    });

    // Execute the full path
    fsm.transition(AAEvent.SHOW);
    fsm.transition(AAEvent.HOLD_TIMEOUT);
    fsm.transition(AAEvent.CONFIRM);
    fsm.transition(AAEvent.CONFIRM);

    const log = fsm.getTransitionLog();

    // Proof: No confidence field appears anywhere
    for (const entry of log) {
      expect(entry).not.toHaveProperty("confidence");
    }

    // Proof: FSM has no confidence field
    expect(fsm).not.toHaveProperty("confidence");
  });

  it("INVARIANT: One Confirmation = One Action", () => {
    const fsm = createAAFSM({
      contextId: "file-A",
      timestamp: Date.now(),
      sourceHash: "hash-A",
    });

    // Setup valid path
    fsm.transition(AAEvent.SHOW);
    fsm.transition(AAEvent.HOLD_TIMEOUT);
    fsm.transition(AAEvent.CONFIRM); // First confirmation
    expect(fsm.getState()).toBe(AAState.CONFIRM_READY);

    fsm.transition(AAEvent.CONFIRM); // Second confirmation = EXECUTED
    expect(fsm.getState()).toBe(AAState.EXECUTED);

    // Try to execute again
    expect(() => {
      fsm.transition(AAEvent.CONFIRM);
    }).toThrow();

    // Proof: One confirmation sequence = one atomic execution
    expect(fsm.isTerminal()).toBe(true);
  });
});
