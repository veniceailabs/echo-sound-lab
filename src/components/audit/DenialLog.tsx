/**
 * Denial Log (Phase 3B Audit UI)
 *
 * Read-only display of capability denials.
 * Final denials only — no negotiation, no retry affordances.
 *
 * CONSTITUTIONAL RULES (PHASE3B_AUDIT_UI_SPEC.md):
 * - G-INV-01: No event handlers beyond render
 * - G-INV-02: Data from logs only
 * - G-INV-03: No temporal illusions
 * - G-INV-04: No psychological pressure
 *
 * SPECIFIC INVARIANTS:
 * - One row per denial
 * - No "why not try..." text
 * - No retry affordance
 * - Denial appears final and irreversible
 *
 * FAIL CONDITIONS:
 * - Denial triggers suggestion
 * - Denial links to action
 * - Denial appears reversible
 */

import React from 'react';

export interface AuditEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
  sequence: number;
}

export interface DenialLogProps {
  auditLog: AuditEvent[];
  className?: string;
}

type DenialReason =
  | 'DEFAULT_DENY'
  | 'TTL_EXPIRED'
  | 'OUT_OF_SCOPE'
  | 'PROCESS_IDENTITY_MISMATCH'
  | 'SIDE_EFFECT_ESCALATION'
  | 'UNKNOWN';

function getDenialReason(data: Record<string, any>): DenialReason {
  const reason = data.reason || '';

  if (reason.includes('expired') || reason.includes('TTL')) return 'TTL_EXPIRED';
  if (reason.includes('C6_HALT') || reason.includes('Process identity')) return 'PROCESS_IDENTITY_MISMATCH';
  if (reason.includes('scope')) return 'OUT_OF_SCOPE';
  if (reason.includes('escalation') || reason.includes('side-effect')) return 'SIDE_EFFECT_ESCALATION';
  if (reason.includes('inactive')) return 'DEFAULT_DENY';

  return 'DEFAULT_DENY';
}

export function DenialLog({ auditLog, className = '' }: DenialLogProps) {
  // Extract denial events
  const denialEvents = auditLog.filter(e => e.type === 'CAPABILITY_DENIED');

  if (denialEvents.length === 0) {
    return (
      <div className={`${className} p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500`}>
        <p>No denied actions in this session.</p>
      </div>
    );
  }

  // Build denial entries
  const denialEntries = denialEvents.map((event) => {
    const reason = getDenialReason(event.data);

    return {
      timestamp: event.timestamp,
      capability: event.data.capability || 'UNKNOWN',
      reason,
      reasonText: event.data.reason || 'No reason provided',
      sequence: event.sequence
    };
  });

  // Sort by timestamp (newest first)
  denialEntries.sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className={className}>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Denial Log</h3>
          <p className="text-xs text-gray-600 mt-1">Actions that were not permitted.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Timestamp</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Capability</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Reason</th>
              </tr>
            </thead>
            <tbody>
              {denialEntries.map((entry, idx) => (
                <tr key={`${entry.sequence}-${entry.capability}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 text-gray-900 font-mono text-xs">
                    {new Date(entry.timestamp).toISOString()}
                  </td>
                  <td className="px-4 py-2 text-gray-900">
                    <span className="bg-red-100 text-red-900 px-2 py-1 rounded font-mono text-xs">
                      {entry.capability}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    <div>
                      <p className="font-medium text-gray-900">{entry.reason}</p>
                      <p className="text-xs text-gray-600 mt-1">{entry.reasonText}</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          <p>Denials are final. Retrying requires explicit user action and a new capability grant.</p>
        </div>
      </div>
    </div>
  );
}

export default DenialLog;
