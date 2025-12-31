/**
 * Action Authority: HUD Stub Component
 *
 * Minimal example showing:
 *  1. How to use useActionAuthority hook
 *  2. Keyboard-driven Dead Man's Switch (Space key = hold)
 *  3. State rendering (FSM is single source of truth)
 *  4. Ghost overlay (preview before execution)
 *
 * This is not production UI. It's a reference implementation.
 * The pattern: FSM decides, UI renders, user confirms.
 */

import React, { useState, useEffect } from "react";
import { AAState } from "../fsm";
import { AAOperationalContext } from "../context-binding";
import { useActionAuthority } from "../hooks/useActionAuthority";

interface ActionAuthorityHUDProps {
  context: AAOperationalContext;
  onExecuted?: (ghostId: string) => void;
  onCancelled?: () => void;
}

export const ActionAuthorityHUD: React.FC<ActionAuthorityHUDProps> = ({
  context,
  onExecuted,
  onCancelled,
}) => {
  const { state, ghost, arm, release, confirm, cancel, debug, isArmed, isTerminal } =
    useActionAuthority(context);

  const [spaceHeld, setSpaceHeld] = useState(false);

  /**
   * Keyboard: Space bar = Dead Man's Switch
   *
   * - Space DOWN: arm (start 400ms hold timer)
   * - Space UP: release (check if threshold met)
   * - Enter: confirm (if armed)
   * - Escape: cancel
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spaceHeld && !isTerminal) {
        e.preventDefault();
        setSpaceHeld(true);
        arm();
      }

      if (e.code === "Enter" && !isTerminal) {
        e.preventDefault();
        confirm();
      }

      if (e.code === "Escape") {
        e.preventDefault();
        cancel();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && spaceHeld) {
        e.preventDefault();
        setSpaceHeld(false);
        const thresholdMet = release();

        // Visual feedback
        if (!thresholdMet) {
          console.log("🔵 Hold released too early (< 400ms). Back to VISIBLE_GHOST.");
        } else {
          console.log("✅ Hold threshold met (≥ 400ms). Ready to confirm.");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [spaceHeld, arm, release, confirm, cancel, isTerminal]);

  /**
   * Trigger callbacks on terminal states
   */
  useEffect(() => {
    if (state === AAState.EXECUTED && ghost && onExecuted) {
      onExecuted(ghost.id);
    }

    if ((state === AAState.REJECTED || state === AAState.EXPIRED) && onCancelled) {
      onCancelled();
    }
  }, [state, ghost, onExecuted, onCancelled]);

  /**
   * Render: FSM state determines everything
   */
  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        width: 300,
        height: "100vh",
        backgroundColor: "#1a1a1a",
        color: "#fff",
        padding: "20px",
        fontFamily: "monospace",
        fontSize: "12px",
        borderLeft: "2px solid #333",
        overflow: "auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "20px", borderBottom: "1px solid #444", paddingBottom: "10px" }}>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>Action Authority HUD</div>
        <div style={{ fontSize: "10px", color: "#888" }}>v1.0 · Local Only</div>
      </div>

      {/* FSM State Display (Single Source of Truth) */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: "#aaa", marginBottom: "5px" }}>STATE</div>
        <div
          style={{
            fontSize: "13px",
            fontWeight: "bold",
            color: getStateColor(state),
            padding: "8px",
            backgroundColor: "#222",
            borderRadius: "4px",
          }}
        >
          {state}
        </div>
      </div>

      {/* Ghost (Preview Overlay) */}
      {ghost && (
        <div style={{ marginBottom: "20px", backgroundColor: "#1f2833", padding: "10px", borderRadius: "4px" }}>
          <div style={{ color: "#aaa", marginBottom: "5px" }}>PREVIEW</div>
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#ffd700" }}>{ghost.type}</div>
            <div style={{ color: "#ccc", fontSize: "11px", marginTop: "4px" }}>
              {ghost.description}
            </div>
          </div>
          {ghost.confidence !== undefined && (
            <div style={{ color: "#999", fontSize: "11px", marginTop: "4px" }}>
              ⓘ Confidence: {(ghost.confidence * 100).toFixed(0)}% (informational only)
            </div>
          )}
        </div>
      )}

      {/* Hold Progress Bar (Visual Feedback) */}
      {isArmed && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ color: "#aaa", marginBottom: "5px" }}>HOLD PROGRESS</div>
          <div style={{ width: "100%", height: "20px", backgroundColor: "#222", borderRadius: "4px" }}>
            <div
              style={{
                width: `${debug.holdProgress * 100}%`,
                height: "100%",
                backgroundColor: debug.holdProgress >= 1 ? "#00ff00" : "#ff9900",
                borderRadius: "4px",
                transition: "width 0.05s linear",
              }}
            />
          </div>
          <div style={{ color: "#999", fontSize: "11px", marginTop: "4px" }}>
            {(debug.holdProgress * 100).toFixed(0)}% (400ms required)
          </div>
        </div>
      )}

      {/* Keyboard Controls */}
      <div style={{ marginBottom: "20px", backgroundColor: "#1f2833", padding: "10px", borderRadius: "4px" }}>
        <div style={{ color: "#aaa", marginBottom: "8px" }}>CONTROLS</div>

        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              padding: "6px",
              backgroundColor: spaceHeld ? "#00ff00" : "#333",
              borderRadius: "3px",
              color: spaceHeld ? "#000" : "#ccc",
            }}
          >
            SPACE: {"Hold "}
            {spaceHeld ? "⬇️ ARMED" : "⬆️ release"}
          </div>
        </div>

        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              padding: "6px",
              backgroundColor: isArmed ? "#0066ff" : "#333",
              borderRadius: "3px",
              color: isArmed ? "#fff" : "#999",
              cursor: isArmed ? "pointer" : "not-allowed",
            }}
          >
            ENTER: Confirm {isArmed ? "✓" : "(disabled)"}
          </div>
        </div>

        <div>
          <div
            style={{
              padding: "6px",
              backgroundColor: "#333",
              borderRadius: "3px",
              color: "#ccc",
              cursor: "pointer",
            }}
          >
            ESC: Cancel
          </div>
        </div>
      </div>

      {/* Execution Result */}
      {state === AAState.EXECUTED && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#006600",
            borderRadius: "4px",
            marginBottom: "20px",
            color: "#00ff00",
          }}
        >
          ✅ EXECUTED
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>
            Action confirmed and applied.
          </div>
        </div>
      )}

      {state === AAState.EXPIRED && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#663300",
            borderRadius: "4px",
            marginBottom: "20px",
            color: "#ffaa00",
          }}
        >
          ⏱ EXPIRED
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>
            Context changed. Action is stale.
          </div>
        </div>
      )}

      {state === AAState.REJECTED && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#330000",
            borderRadius: "4px",
            marginBottom: "20px",
            color: "#ff6666",
          }}
        >
          ✕ REJECTED
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>
            Action cancelled by user.
          </div>
        </div>
      )}

      {/* Debug Info */}
      <div style={{ marginBottom: "20px", backgroundColor: "#1f2833", padding: "10px", borderRadius: "4px" }}>
        <div style={{ color: "#aaa", marginBottom: "8px" }}>DEBUG</div>
        <div style={{ color: "#999", fontSize: "11px" }}>
          <div>Transitions: {debug.transitionCount}</div>
          <div>Is Armed: {String(isArmed)}</div>
          <div>Is Terminal: {String(isTerminal)}</div>
        </div>
      </div>

      {/* Rules (Immutable) */}
      <div style={{ backgroundColor: "#1a3a1a", padding: "10px", borderRadius: "4px", fontSize: "10px" }}>
        <div style={{ color: "#00dd00", marginBottom: "5px" }}>IMMUTABLE RULES</div>
        <ul style={{ color: "#88dd88", margin: 0, paddingLeft: "15px" }}>
          <li>Hold ≥400ms required</li>
          <li>No skipping confirmation</li>
          <li>One confirm = one execute</li>
          <li>Confidence ≠ permission</li>
        </ul>
      </div>
    </div>
  );
};

/**
 * Helper: State color coding
 */
function getStateColor(state: AAState): string {
  const colors: Record<AAState, string> = {
    [AAState.GENERATED]: "#888",
    [AAState.VISIBLE_GHOST]: "#ffaa00",
    [AAState.PREVIEW_ARMED]: "#00ff00",
    [AAState.CONFIRM_READY]: "#0066ff",
    [AAState.EXECUTED]: "#00ff00",
    [AAState.EXPIRED]: "#ff6666",
    [AAState.REJECTED]: "#ff6666",
  };
  return colors[state] || "#fff";
}
