
/**
 * Action Authority: ActionSafetyRail
 *
 * Persistent status bar at the bottom of the viewport.
 * Pure renderer: HUDState → Visual status + Authority Badge.
 *
 * ⚠️ ARCHITECTURAL CONSTRAINT (v1.0.0 Golden Master):
 * This component MUST NEVER:
 *   ❌ Branch on AAState
 *   ❌ Branch on state (the internal FSM state)
 *   ❌ Access the hook or FSM directly
 *   ❌ Emit any execution events
 *
 * All rendering MUST be driven by hudState (HUDState enum) only.
 *
 * Rules:
 * - No internal state, no timers, no logic
 * - Receives HUDState as a prop
 * - Looks up VISUAL_CONTRACT[hudState]
 * - Renders statusText, state icon, and Authority Badge
 * - Badge is unmounted unless in CONFIRM_READY or EXECUTED
 */

import React, { useMemo } from "react";
import { HUDState, VISUAL_CONTRACT, COLORS, BORDERS } from "../visual-contract";

interface ActionSafetyRailProps {
  hudState: HUDState;
  shortHash?: string;
  session?: string;
}

/**
 * Get visual icon for HUDState
 */
function getStateIcon(hudState: HUDState): string {
  switch (hudState) {
    case HUDState.VISIBLE_GHOST:
      return "◐";
    case HUDState.HOLDING:
      return "◑";
    case HUDState.PREVIEW_ARMED:
      return "◕";
    case HUDState.CONFIRM_READY:
      return "◔";
    case HUDState.EXECUTED:
      return "●";
    case HUDState.EXPIRED:
      return "✕";
    case HUDState.REJECTED:
      return "⊗";
    default:
      const _exhaustive: never = hudState;
      return _exhaustive;
  }
}

/**
 * Authority Badge: Legal and cryptographic anchor
 * Only rendered on CONFIRM_READY and EXECUTED states.
 */
function AuthorityBadge({
  hudState,
  shortHash,
  session,
}: {
  hudState: HUDState;
  shortHash: string;
  session: string;
}): React.ReactElement | null {
  // Unmount badge unless in CONFIRM_READY or EXECUTED
  if (hudState !== HUDState.CONFIRM_READY && hudState !== HUDState.EXECUTED) {
    return null;
  }

  return (
    <code
      className="text-[10px] font-mono"
      style={{
        color: COLORS.NEUTRAL,
        backgroundColor: "rgba(30, 41, 59, 0.5)",
        padding: "0.5rem 0.75rem",
        borderRadius: "0.375rem",
        border: `1px solid rgba(100, 116, 139, 0.3)`,
        whiteSpace: "nowrap",
      }}
    >
      ID: <span style={{ color: "#f1f5f9" }}>{shortHash}</span> | AUTHORIZED BY:{" "}
      <span style={{ color: "#f1f5f9" }}>{session}</span> | STATUS:{" "}
      <span style={{ color: COLORS.SUCCESS }}>SEALED</span>
    </code>
  );
}

/**
 * ActionSafetyRail: Persistent bottom status bar
 *
 * Props:
 * - hudState: Current visual state
 * - shortHash: Action ID (for badge)
 * - session: Human session ID (for badge)
 *
 * Rendering:
 * - Lookup VISUAL_CONTRACT[hudState]
 * - Display state icon + statusText
 * - Conditionally render Authority Badge
 */
export const ActionSafetyRail: React.FC<ActionSafetyRailProps> = ({
  hudState,
  shortHash = "0x000000",
  session = "ANONYMOUS_SESSION",
}) => {
  // Memoize visual properties lookup
  const spec = useMemo(
    () => VISUAL_CONTRACT[hudState],
    [hudState]
  );

  // Determine visibility based on opacity
  const isVisible = spec.opacity > 0 || hudState === HUDState.HOLDING;

  return (
    <div
      id="aa-safety-rail"
      className="fixed bottom-0 left-0 right-0 z-[9999]"
      style={{
        height: "40px",
        backgroundColor: COLORS.RAIL_BG,
        borderTop: `1px solid ${spec.borderColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "1rem",
        paddingRight: "1rem",
        opacity: isVisible ? 1 : 0,
        pointerEvents: "none",
        transition: "opacity 100ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Left: State icon + status text */}
      <div
        className="flex items-center gap-3"
        style={{
          minWidth: "0",
          flex: "1",
        }}
      >
        <span
          style={{
            color: spec.borderColor,
            fontSize: "18px",
            fontWeight: "bold",
            flexShrink: 0,
          }}
        >
          {getStateIcon(hudState)}
        </span>
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{
            color: spec.borderColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {spec.statusText}
        </span>
      </div>

      {/* Right: Authority Badge (unmounted unless CONFIRM_READY/EXECUTED) */}
      <AuthorityBadge
        hudState={hudState}
        shortHash={shortHash}
        session={session}
      />
    </div>
  );
};
