/**
 * Action Authority: ActionAuthorityHUD
 *
 * Pure visual renderer for the Authority Layer.
 * Receives HUDState + holdProgress and renders deterministically.
 *
 * ⚠️ ARCHITECTURAL CONSTRAINT (v1.0.0 Golden Master):
 * This component MUST NEVER:
 *   ❌ Branch on AAState
 *   ❌ Branch on state (the internal FSM state)
 *   ❌ Access the FSM directly
 *   ❌ Compare holdProgress to thresholds (it is visual feedback only)
 *   ❌ Emit any execution events (arm, confirm, cancel)
 *
 * All rendering MUST be driven by hudState (HUDState enum) only.
 * If you need to add conditional logic, ask: "Is this a HUDState branch?"
 * If not, the logic belongs in the projection adapter (useActionAuthority hook).
 *
 * Composition:
 * 1. GhostOverlay: Animated preview card
 * 2. FrictionPulseMeter: Progress ring (visible in HOLDING state only)
 * 3. TunnelEffect: Desaturate background (visible in CONFIRM_READY state only)
 * 4. SuccessFlash: Flash effect (visible briefly on EXECUTED)
 * 5. ActionSafetyRail: Persistent bottom status bar
 *
 * No internal state. No timers. Pure projection of HUDState + props.
 */

import React, { useMemo, useEffect, useState, createPortal } from "react";
import {
  HUDState,
  VISUAL_CONTRACT,
  COLORS,
  BORDERS,
  FILTERS,
} from "../visual-contract";
import { ActionSafetyRail } from "./ActionSafetyRail";
import { PolicyResult } from "../governance/semantic/types";

interface ActionAuthorityHUDProps {
  hudState: HUDState;
  ghost: any | null; // Action preview data (immutable)
  holdProgress: number; // 0.0 to 1.0 (from hook only)
  shortHash?: string; // For Authority Badge
  session?: string; // For Authority Badge
  policyResult?: PolicyResult; // Level 4: Policy evaluation result (Amendment K)
}

/**
 * FrictionPulseMeter: Circular progress ring
 * Visible only during HOLDING state.
 * If not HOLDING, renders null (unmounted).
 */
function FrictionPulseMeter({
  hudState,
  holdProgress,
}: {
  hudState: HUDState;
  holdProgress: number;
}): React.ReactElement | null {
  // Unmount if not in HOLDING state
  if (hudState !== HUDState.HOLDING) {
    return null;
  }

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.max(0, holdProgress));

  return (
    <div
      className="fixed bottom-32 right-8 z-30"
      style={{
        width: "100px",
        height: "100px",
        pointerEvents: "none",
      }}
    >
      <svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
        style={{ filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))" }}
      >
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(100, 116, 139, 0.2)"
          strokeWidth="3"
        />

        {/* Progress ring */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={COLORS.ACTIVE}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transformOrigin: "50px 50px",
            transform: "rotate(-90deg)",
            transition: "stroke-dashoffset 0ms linear",
          }}
        />

        {/* Center text: percentage */}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={COLORS.ACTIVE}
          style={{
            fontSize: "12px",
            fontWeight: "bold",
            fontFamily: "monospace",
          }}
        >
          {Math.round(holdProgress * 100)}%
        </text>
      </svg>
    </div>
  );
}

/**
 * TunnelEffect: Global desaturation overlay
 * Visible only during CONFIRM_READY state.
 * Uses React Portal to apply to the root element.
 */
function TunnelEffect({
  hudState,
}: {
  hudState: HUDState;
}): React.ReactElement | null {
  // Unmount if not in CONFIRM_READY state
  if (hudState !== HUDState.CONFIRM_READY) {
    return null;
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    return null;
  }

  // Apply grayscale filter to root (all background content)
  const originalFilter = rootElement.style.filter;
  useEffect(() => {
    rootElement.style.filter = "grayscale(100%) brightness(0.7)";
    return () => {
      rootElement.style.filter = originalFilter;
    };
  }, [originalFilter]);

  // Render tunnel overlay (visual vignette)
  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        background: "radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.5) 100%)",
        zIndex: 40,
      }}
    />,
    document.body
  );
}

/**
 * SuccessFlash: Full-screen flash effect
 * Triggered on EXECUTED state, lasts 100ms.
 */
function SuccessFlash({
  hudState,
}: {
  hudState: HUDState;
}): React.ReactElement | null {
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    if (hudState === HUDState.EXECUTED) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 100);
      return () => clearTimeout(timer);
    }
  }, [hudState]);

  if (!showFlash) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        background: `rgba(34, 197, 94, 0.8)`,
        zIndex: 50,
        animation: "none",
      }}
    />,
    document.body
  );
}

/**
 * GhostOverlay: The main action preview card
 * Renders with opacity and border properties from VISUAL_CONTRACT.
 */
function GhostOverlay({
  hudState,
  ghost,
}: {
  hudState: HUDState;
  ghost: any | null;
}): React.ReactElement | null {
  // Look up visual properties from contract
  const spec = useMemo(
    () => VISUAL_CONTRACT[hudState],
    [hudState]
  );

  // Determine visibility and transform based on state
  let transform = "scale(1) translateY(0)";
  if (hudState === HUDState.EXPIRED) {
    transform = "scale(0.8) translateY(20px)";
  } else if (hudState === HUDState.REJECTED) {
    transform = "scale(0.9) translateY(0)";
  }

  // Don't render ghost if invisible and no content
  if (spec.opacity === 0 && !ghost) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-30"
      style={{
        opacity: spec.opacity,
        transition: "opacity 100ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Ghost card */}
      <div
        className="rounded-lg shadow-2xl p-8 max-w-md w-full mx-4"
        style={{
          backgroundColor: "rgba(3, 7, 18, 0.95)",
          borderStyle: spec.borderStyle.includes("dashed") ? "dashed" : "solid",
          borderWidth: spec.borderStyle === BORDERS.NONE ? "0" : "2px",
          borderColor: spec.borderColor,
          transform: transform,
          transition: "transform 100ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Ghost content */}
        {ghost && (
          <>
            <h2
              className="text-xl font-bold mb-2"
              style={{ color: "#f1f5f9" }}
            >
              {ghost.type}
            </h2>
            <p
              className="text-sm mb-4"
              style={{ color: "#cbd5e1" }}
            >
              {ghost.description}
            </p>
            {ghost.confidence !== undefined && (
              <p
                className="text-xs"
                style={{ color: "#94a3b8" }}
              >
                Confidence: {(ghost.confidence * 100).toFixed(0)}%
              </p>
            )}
          </>
        )}

        {/* Status text from visual contract */}
        <div
          className="mt-6 pt-4"
          style={{
            borderTopColor: "rgba(100, 116, 139, 0.3)",
            borderTopWidth: "1px",
          }}
        >
          <p
            className="text-sm font-medium text-center"
            style={{ color: spec.borderColor }}
          >
            {spec.statusText}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * PolicyViolationOverlay: Display semantic policy violations
 * Visible only when FSM is in EXPIRED state due to policy violation.
 * Amendment K: All remediation messages are static strings from PolicyEngine.
 */
function PolicyViolationOverlay({
  hudState,
  policyResult,
}: {
  hudState: HUDState;
  policyResult?: PolicyResult;
}): React.ReactElement | null {
  // Only show if EXPIRED due to policy violation
  if (
    hudState !== HUDState.EXPIRED ||
    !policyResult ||
    policyResult.isValid ||
    policyResult.violations.length === 0
  ) {
    return null;
  }

  const primaryViolation = policyResult.violations[0];

  // Map violation type to human-readable label
  const violationLabel = (() => {
    const typeString = primaryViolation.type.toString();
    return typeString
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  })();

  // Determine severity color (all violations use ALERT red palette)
  const severityColor =
    primaryViolation.severity === "CRITICAL" ? "#dc2626" : COLORS.ALERT;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-40"
      style={{ opacity: 1 }}
    >
      {/* Violation card */}
      <div
        className="rounded-lg shadow-2xl p-8 max-w-md w-full mx-4"
        style={{
          backgroundColor: "rgba(3, 7, 18, 0.95)",
          borderStyle: "solid",
          borderWidth: "2px",
          borderColor: severityColor,
          animation: "none",
        }}
      >
        {/* Violation header with icon and code */}
        <div className="flex items-start gap-3 mb-4">
          <div
            style={{
              fontSize: "24px",
              color: severityColor,
              flexShrink: 0,
            }}
          >
            🚫
          </div>
          <div>
            <h2
              className="text-lg font-bold mb-1"
              style={{ color: severityColor }}
            >
              {violationLabel}
            </h2>
            <p
              className="text-xs font-mono"
              style={{ color: "#94a3b8" }}
            >
              {primaryViolation.type}
            </p>
          </div>
        </div>

        {/* Violation reason */}
        <p
          className="text-sm mb-4"
          style={{ color: "#cbd5e1", lineHeight: "1.5" }}
        >
          {primaryViolation.reason}
        </p>

        {/* Severity badge */}
        <div className="mb-4 inline-flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-1 rounded"
            style={{
              backgroundColor: severityColor,
              color: "#fff",
              opacity: primaryViolation.severity === "CRITICAL" ? 1 : 0.8,
            }}
          >
            {primaryViolation.severity}
          </span>
        </div>

        {/* Suggested fix (Amendment K: static string from PolicyEngine) */}
        {primaryViolation.suggestedFix && (
          <div
            className="mt-6 pt-4"
            style={{
              borderTopColor: "rgba(100, 116, 139, 0.3)",
              borderTopWidth: "1px",
            }}
          >
            <p
              className="text-xs font-medium mb-2"
              style={{ color: "#94a3b8" }}
            >
              REMEDIATION:
            </p>
            <p
              className="text-sm"
              style={{ color: "#f1f5f9", fontFamily: "monospace" }}
            >
              {primaryViolation.suggestedFix}
            </p>
          </div>
        )}

        {/* Additional violations indicator */}
        {policyResult.violations.length > 1 && (
          <p
            className="text-xs mt-4 text-center"
            style={{ color: "#64748b" }}
          >
            +{policyResult.violations.length - 1} additional{" "}
            {policyResult.violations.length - 1 === 1 ? "violation" : "violations"}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * ActionAuthorityHUD: Main HUD component
 *
 * Props-driven renderer:
 * - hudState: The current visual state
 * - holdProgress: 0.0 to 1.0 (passed from hook, used only in HOLDING state)
 * - ghost: Action preview data (immutable)
 * - shortHash, session: For Authority Badge
 * - policyResult: Policy evaluation result (Level 4, Amendment K)
 *
 * No internal state beyond UI animations (flash, tunnel).
 * No logic beyond table lookups and conditional rendering.
 */
export const ActionAuthorityHUD: React.FC<ActionAuthorityHUDProps> = ({
  hudState,
  ghost,
  holdProgress,
  shortHash = "0x000000",
  session = "ANONYMOUS_SESSION",
  policyResult,
}) => {
  return (
    <div className="action-authority-hud" style={{ pointerEvents: "none" }}>
      {/* Ghost preview overlay */}
      <GhostOverlay hudState={hudState} ghost={ghost} />

      {/* Friction pulse meter (only visible in HOLDING) */}
      <FrictionPulseMeter hudState={hudState} holdProgress={holdProgress} />

      {/* Tunnel effect (only visible in CONFIRM_READY) */}
      <TunnelEffect hudState={hudState} />

      {/* Success flash (only visible on EXECUTED) */}
      <SuccessFlash hudState={hudState} />

      {/* Policy violation overlay (visible on EXPIRED due to violation) */}
      <PolicyViolationOverlay hudState={hudState} policyResult={policyResult} />

      {/* Persistent safety rail (always visible unless GENERATED) */}
      <ActionSafetyRail
        hudState={hudState}
        shortHash={shortHash}
        session={session}
      />
    </div>
  );
};
