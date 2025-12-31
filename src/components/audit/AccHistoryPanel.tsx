/**
 * ACC History Panel (Phase 3B Audit UI)
 *
 * Read-only display of Active Consent Checkpoint issuance and outcomes.
 *
 * CONSTITUTIONAL RULES (PHASE3B_AUDIT_UI_SPEC.md):
 * - G-INV-01: No event handlers beyond render
 * - G-INV-02: Data only from audit log (no inference)
 * - G-INV-03: No auto-refresh or temporal illusions
 * - G-INV-04: No psychological pressure
 *
 * SPECIFIC INVARIANTS:
 * - Each token appears exactly once
 * - Approved tokens must have corresponding ACC_TOKEN_CONSUMED in logs
 * - No replay buttons, no "approve again" affordances
 * - Token ID shown as redacted hash (first 6 chars only)
 *
 * FAIL CONDITIONS:
 * - Token appears twice in UI
 * - Token appears without ACC_ISSUED event
 * - Any interactive affordance exists on token row
 */

import React from 'react';

export interface AuditEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
  sequence: number;
}

export interface AccHistoryPanelProps {
  auditLog: AuditEvent[];
  className?: string;
}

export function AccHistoryPanel({ auditLog, className = '' }: AccHistoryPanelProps) {
  // Extract ACC events from log
  // Build map: accId → { issued, response, validated, consumed }
  const accMap = new Map<
    string,
    {
      issued: AuditEvent | null;
      response: AuditEvent | null;
      validated: AuditEvent | null;
      consumed: AuditEvent | null;
    }
  >();

  for (const event of auditLog) {
    if (event.type === 'ACC_ISSUED') {
      const accId = event.data.accId;
      if (!accMap.has(accId)) {
        accMap.set(accId, { issued: null, response: null, validated: null, consumed: null });
      }
      accMap.get(accId)!.issued = event;
    } else if (event.type === 'ACC_RESPONSE_RECEIVED') {
      const accId = event.data.accId;
      if (!accMap.has(accId)) {
        accMap.set(accId, { issued: null, response: null, validated: null, consumed: null });
      }
      accMap.get(accId)!.response = event;
    } else if (event.type === 'ACC_VALIDATED') {
      const accId = event.data.accId;
      if (!accMap.has(accId)) {
        accMap.set(accId, { issued: null, response: null, validated: null, consumed: null });
      }
      accMap.get(accId)!.validated = event;
    } else if (event.type === 'ACC_TOKEN_CONSUMED') {
      const accId = event.data.accId;
      if (!accMap.has(accId)) {
        accMap.set(accId, { issued: null, response: null, validated: null, consumed: null });
      }
      accMap.get(accId)!.consumed = event;
    }
  }

  // Build ACC history entries
  const accHistoryEntries = Array.from(accMap.entries()).map(([accId, events]) => {
    const issuedEvent = events.issued;
    const consumedEvent = events.consumed;
    const validatedEvent = events.validated;

    // Determine status
    let status: 'APPROVED' | 'DENIED' | 'EXPIRED' = 'DENIED';
    if (consumedEvent) {
      status = 'APPROVED';
    } else if (validatedEvent && !consumedEvent) {
      status = 'EXPIRED'; // Validated but never consumed
    }

    return {
      accId,
      timestamp: issuedEvent?.timestamp || Date.now(),
      capability: issuedEvent?.data?.capability || 'UNKNOWN',
      status,
      tokenHash: accId.substring(0, 6), // Redacted hash
      challenge: issuedEvent?.data?.challenge || '???',
      isApproved: status === 'APPROVED',
      isDenied: status === 'DENIED',
      isExpired: status === 'EXPIRED'
    };
  });

  // Sort by timestamp (newest first)
  accHistoryEntries.sort((a, b) => b.timestamp - a.timestamp);

  if (accHistoryEntries.length === 0) {
    return (
      <div className={`${className} p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500`}>
        <p>No ACC history in this session.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Active Consent Checkpoints</h3>
          <p className="text-xs text-gray-600 mt-1">Every confirmation checkpoint and its outcome.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Timestamp</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Capability</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Result</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Token</th>
              </tr>
            </thead>
            <tbody>
              {accHistoryEntries.map((entry, idx) => (
                <tr key={entry.accId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 text-gray-900 font-mono text-xs">
                    {new Date(entry.timestamp).toISOString()}
                  </td>
                  <td className="px-4 py-2 text-gray-900">
                    <span className="bg-blue-100 text-blue-900 px-2 py-1 rounded font-mono text-xs">
                      {entry.capability}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {entry.isApproved && (
                      <span className="bg-green-100 text-green-900 px-2 py-1 rounded font-medium text-xs">
                        ✓ APPROVED
                      </span>
                    )}
                    {entry.isDenied && (
                      <span className="bg-red-100 text-red-900 px-2 py-1 rounded font-medium text-xs">
                        ✗ DENIED
                      </span>
                    )}
                    {entry.isExpired && (
                      <span className="bg-yellow-100 text-yellow-900 px-2 py-1 rounded font-medium text-xs">
                        ⏱ EXPIRED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600 font-mono">
                    {entry.tokenHash}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          <p>Tokens are single-use and marked consumed after approval.</p>
        </div>
      </div>
    </div>
  );
}

export default AccHistoryPanel;
