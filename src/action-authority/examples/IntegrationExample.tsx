/**
 * Action Authority: Integration Example
 *
 * This shows how to use ActionAuthorityHUD in a real application.
 *
 * Key pattern:
 *  1. Create an operational context (file ID, hash, etc.)
 *  2. Mount the HUD component
 *  3. The HUD manages user intent internally
 *  4. Parent receives callbacks when actions complete
 *  5. FSM invariants are preserved at the hook level (impossible to violate from UI)
 */

import React, { useState, useCallback } from "react";
import { ActionAuthorityHUD } from "../components/ActionAuthorityHUD";
import { AAOperationalContext } from "../context-binding";

/**
 * Example parent component that uses Action Authority
 */
export const ActionAuthorityIntegrationExample: React.FC = () => {
  // Simulate file context (in real app, this comes from your file manager)
  const [currentFile, setCurrentFile] = useState({
    id: "file-abc123",
    name: "song.wav",
    hash: "hash-xyz789",
  });

  // Operational context for the HUD
  const context: AAOperationalContext = {
    contextId: currentFile.id,
    sourceHash: currentFile.hash,
    timestamp: Date.now(),
  };

  // Track application state (what actions have been executed)
  const [executedActions, setExecutedActions] = useState<string[]>([]);
  const [hudVisible, setHudVisible] = useState(true);

  /**
   * Callback: Action was executed
   * This is where you apply the actual effect (brighten, reduce noise, etc.)
   */
  const handleActionExecuted = useCallback((ghostId: string) => {
    console.log(`✅ Action executed: ${ghostId}`);
    setExecutedActions((prev) => [...prev, ghostId]);

    // In real app, you'd:
    // - Apply DSP effect
    // - Update audio state
    // - Trigger re-render
  }, []);

  /**
   * Callback: Action was cancelled/expired
   */
  const handleActionCancelled = useCallback(() => {
    console.log("✕ Action cancelled or expired");
    // Reset UI, clear previews, etc.
  }, []);

  /**
   * Simulate generating an action suggestion
   * In real app, this comes from the APL perception layer
   */
  const generateSuggestion = useCallback(() => {
    // Example: High-confidence suggestion
    // (Note: Confidence is informational only. It CANNOT cause execution.)
    console.log(
      "🔵 APL suggests: Brighten audio (confidence: 0.95). " +
        "User must HOLD ≥400ms + CONFIRM to execute. " +
        "High confidence changes NOTHING.",
    );

    // This suggestion would be passed to HUD.show()
    // The HUD would display it as a ghost overlay
  }, []);

  /**
   * Simulate switching files (context change)
   * This invalidates any pending actions
   */
  const switchFile = useCallback(() => {
    setCurrentFile({
      id: "file-def456",
      name: "another-song.wav",
      hash: "hash-aaa111",
    });

    console.log("📂 File switched. All pending actions expired.");
  }, []);

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#0a0a0a",
        color: "#fff",
        fontFamily: "system-ui",
      }}
    >
      {/* Main content area */}
      <div style={{ flex: 1, padding: "40px", overflow: "auto" }}>
        <h1>Action Authority Integration Example</h1>

        <p style={{ color: "#aaa", marginBottom: "30px" }}>
          This demonstrates how Action Authority enforces human-in-the-loop execution
          at the architectural level.
        </p>

        {/* File Info */}
        <section style={{ marginBottom: "40px", padding: "20px", backgroundColor: "#1a1a1a", borderRadius: "8px" }}>
          <h2>Current File</h2>
          <div style={{ fontFamily: "monospace", fontSize: "14px" }}>
            <div>ID: {currentFile.id}</div>
            <div>Name: {currentFile.name}</div>
            <div>Hash: {currentFile.hash}</div>
          </div>

          <div style={{ marginTop: "20px" }}>
            <button
              onClick={switchFile}
              style={{
                padding: "8px 16px",
                backgroundColor: "#333",
                color: "#fff",
                border: "1px solid #555",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Switch File (invalidates pending actions)
            </button>
          </div>
        </section>

        {/* APL Suggestions */}
        <section style={{ marginBottom: "40px", padding: "20px", backgroundColor: "#1a1a1a", borderRadius: "8px" }}>
          <h2>APL Suggestions (Read-Only)</h2>
          <p style={{ color: "#aaa", fontSize: "14px" }}>
            The perception layer (APL) generates suggestions. These are advisory only.
            <br />
            Suggestions CANNOT execute themselves. User must explicitly confirm.
          </p>

          <button
            onClick={generateSuggestion}
            style={{
              padding: "8px 16px",
              backgroundColor: "#0066cc",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Generate Suggestion (APL)
          </button>

          <div style={{ marginTop: "20px", color: "#999", fontSize: "12px" }}>
            <p>
              💡 Fact: Confidence = 0.95 (95% certain). <br />
              ❌ Does NOT skip confirmation. <br />
              ✅ Requires HOLD ≥400ms + explicit ENTER press.
            </p>
          </div>
        </section>

        {/* Executed Actions */}
        <section style={{ marginBottom: "40px", padding: "20px", backgroundColor: "#1a1a1a", borderRadius: "8px" }}>
          <h2>Executed Actions</h2>
          {executedActions.length === 0 ? (
            <p style={{ color: "#999" }}>No actions executed yet.</p>
          ) : (
            <div style={{ fontFamily: "monospace", fontSize: "12px" }}>
              {executedActions.map((actionId, idx) => (
                <div key={idx} style={{ padding: "4px", color: "#00ff00" }}>
                  ✓ {actionId}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Documentation */}
        <section style={{ padding: "20px", backgroundColor: "#1a1a1a", borderRadius: "8px" }}>
          <h2>How Action Authority Works</h2>

          <div style={{ color: "#aaa", fontSize: "13px", lineHeight: "1.8" }}>
            <h3 style={{ color: "#fff", marginTop: "15px" }}>1. Perception (APL)</h3>
            <p>
              Reads audio, generates signals (brightness, density, embeddings). <br />
              Confidence scores are informational only (do NOT trigger execution).
            </p>

            <h3 style={{ color: "#fff", marginTop: "15px" }}>2. Recommendation</h3>
            <p>
              Synthesizes APL signals into human-readable suggestions. <br />
              Suggestions appear as "ghosts" (overlays) in the HUD, not applied to audio.
            </p>

            <h3 style={{ color: "#fff", marginTop: "15px" }}>3. Execution (Dead Man's Switch)</h3>
            <p>
              User MUST:<br />
              1. HOLD SPACE ≥400ms (protects against reflexive clicks) <br />
              2. PRESS ENTER (explicit confirmation) <br />
              3. No skipping steps. No confidence shortcuts. No automation.
            </p>

            <h3 style={{ color: "#fff", marginTop: "15px" }}>4. Audit Trail</h3>
            <p>
              Every execution is logged immutably. <br />
              Full context, timestamp, transition history, undo capability.
            </p>

            <h3 style={{ color: "#fff", marginTop: "15px" }}>5. Undo</h3>
            <p>
              Restore exact bit-state before any action. <br />
              No cascade effects. No data loss.
            </p>
          </div>
        </section>
      </div>

      {/* Action Authority HUD (Right Gutter) */}
      {hudVisible && (
        <ActionAuthorityHUD
          context={context}
          onExecuted={handleActionExecuted}
          onCancelled={handleActionCancelled}
        />
      )}

      {/* Close button for HUD */}
      {hudVisible && (
        <button
          onClick={() => setHudVisible(false)}
          style={{
            position: "fixed",
            top: "10px",
            right: "10px",
            padding: "4px 8px",
            backgroundColor: "#333",
            color: "#aaa",
            border: "1px solid #555",
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "12px",
            zIndex: 9999,
          }}
        >
          Hide HUD
        </button>
      )}
    </div>
  );
};

export default ActionAuthorityIntegrationExample;
