/**
 * Session Summary (Phase 3B Audit UI)
 *
 * Read-only display of session lifecycle and outcomes.
 * Complete closure view for the artist.
 *
 * CONSTITUTIONAL RULES (PHASE3B_AUDIT_UI_SPEC.md):
 * - G-INV-01: No state-changing buttons
 * - G-INV-02: Data from logs only (no inference)
 * - G-INV-03: No temporal illusions
 * - G-INV-04: No psychological pressure
 *
 * SPECIFIC INVARIANTS:
 * - Completion declared only if SESSION_INACTIVE exists
 * - Partial sessions must show "INCOMPLETE"
 * - No success language ("great job")
 * - Summary includes only inferred outcomes, not predictions
 *
 * FAIL CONDITIONS:
 * - Session marked complete without teardown
 * - Summary includes inferred future outcomes
 * - Psychological reinforcement language
 */

import React from 'react';

export interface AuditEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
  sequence: number;
}

export interface SessionSummaryProps {
  auditLog: AuditEvent[];
  className?: string;
}

export function SessionSummary({ auditLog, className = '' }: SessionSummaryProps) {
  // Extract key events
  const sessionStartEvent = auditLog.find(e => e.type === 'SESSION_STARTED');
  const sessionEndEvent = auditLog.find(e => e.type === 'SESSION_END_REQUESTED');
  const sessionInactiveEvent = auditLog.find(e => e.type === 'SESSION_INACTIVE');
  const capabilityVisibleEvent = auditLog.find(e => e.type === 'CAPABILITY_VISIBLE');

  if (!sessionStartEvent) {
    return (
      <div className={`${className} p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500`}>
        <p>No session data available.</p>
      </div>
    );
  }

  // Determine completion status
  const isComplete = !!sessionInactiveEvent;
  const status = isComplete ? 'COMPLETE' : 'INCOMPLETE';

  // Count capabilities used
  const capabilitiesUsed = capabilityVisibleEvent?.data?.capabilities || [];
  const executionEvents = auditLog.filter(e => e.type === 'EXECUTION_COMPLETED');
  const accIssuedEvents = auditLog.filter(e => e.type === 'ACC_ISSUED');
  const accConsumedEvents = auditLog.filter(e => e.type === 'ACC_TOKEN_CONSUMED');

  // Calculate session duration
  const startTime = sessionStartEvent.timestamp;
  const endTime = sessionEndEvent?.timestamp || sessionInactiveEvent?.timestamp || Date.now();
  const durationMs = endTime - startTime;
  const durationSeconds = Math.floor(durationMs / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);

  // Unique capabilities that were used
  const capabilitiesUsedSet = new Set<string>();
  for (const event of auditLog) {
    if (event.type === 'CAPABILITY_CHECK') {
      capabilitiesUsedSet.add(event.data.capability);
    }
  }

  return (
    <div className={className}>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Session Summary</h3>
          <p className="text-xs text-gray-600 mt-1">Complete session lifecycle and outcomes.</p>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Status */}
          <div className="p-3 rounded border border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-2">Status</p>
            {isComplete ? (
              <div className="flex items-center gap-2">
                <span className="text-lg">✓</span>
                <span className="text-sm font-mono font-medium text-gray-900">{status}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg">⏳</span>
                <span className="text-sm font-mono font-medium text-gray-900">{status}</span>
              </div>
            )}
            {isComplete && (
              <p className="text-xs text-gray-600 mt-2">Session ended and authority revoked cleanly.</p>
            )}
            {!isComplete && (
              <p className="text-xs text-gray-600 mt-2">Session is still active or was not properly closed.</p>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Timeline</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Started</p>
                <p className="text-xs font-mono text-gray-900">{new Date(startTime).toISOString()}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Ended</p>
                <p className="text-xs font-mono text-gray-900">
                  {endTime > startTime ? new Date(endTime).toISOString() : '(still active)'}
                </p>
              </div>
            </div>
            <div className="p-2 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600 mb-1">Duration</p>
              <p className="text-xs font-mono text-gray-900">
                {durationMinutes}m {durationSeconds % 60}s
              </p>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Activity</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Executions</p>
                <p className="text-sm font-mono font-bold text-gray-900">{executionEvents.length}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">ACCs Issued</p>
                <p className="text-sm font-mono font-bold text-gray-900">{accIssuedEvents.length}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">ACCs Confirmed</p>
                <p className="text-sm font-mono font-bold text-gray-900">{accConsumedEvents.length}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Capabilities Used</p>
                <p className="text-sm font-mono font-bold text-gray-900">{capabilitiesUsedSet.size}</p>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          {capabilitiesUsedSet.size > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Capabilities Checked</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(capabilitiesUsedSet).sort().map(cap => (
                  <span key={cap} className="bg-blue-100 text-blue-900 px-2 py-1 rounded font-mono text-xs">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Teardown */}
          {isComplete && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-xs font-medium text-green-900 mb-1">Teardown Confirmation</p>
              <p className="text-xs text-green-800">Authority was revoked and all grants cleared.</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          <p>All data reconstructed from session audit log.</p>
        </div>
      </div>
    </div>
  );
}

export default SessionSummary;
