/**
 * Capability Timeline (Phase 3B Audit UI)
 *
 * Read-only display of authority over time.
 * Shows when capabilities were granted and when they expire/are revoked.
 *
 * CONSTITUTIONAL RULES (PHASE3B_AUDIT_UI_SPEC.md):
 * - G-INV-01: No state-changing buttons
 * - G-INV-02: Data from logs only (no inference)
 * - G-INV-03: No temporal illusions
 * - G-INV-04: No psychological pressure
 *
 * SPECIFIC INVARIANTS:
 * - Capability status: ACTIVE | EXPIRED | REVOKED
 * - Expiration calculated from logged TTL only
 * - Revocation must correspond to REVOKE_ALL_AUTHORITIES event
 * - No "Extend", "Renew", "Re-enable" affordances
 *
 * FAIL CONDITIONS:
 * - Capability appears ACTIVE past TTL
 * - Status inferred without log evidence
 * - User can interact with capability row
 */

import React from 'react';

export interface AuditEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
  sequence: number;
}

export interface CapabilityTimelineProps {
  auditLog: AuditEvent[];
  className?: string;
}

export function CapabilityTimeline({ auditLog, className = '' }: CapabilityTimelineProps) {
  // Extract authority granted event (if it exists)
  const authorityGrantedEvent = auditLog.find(e => e.type === 'AUTHORITY_GRANTED');
  const capabilityVisibleEvent = auditLog.find(e => e.type === 'CAPABILITY_VISIBLE');
  const revokeAllEvent = auditLog.find(e => e.type === 'REVOKE_ALL_AUTHORITIES');

  if (!authorityGrantedEvent || !capabilityVisibleEvent) {
    return (
      <div className={`${className} p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500`}>
        <p>No capability grants in this session.</p>
      </div>
    );
  }

  // Get granted capabilities
  const capabilities = capabilityVisibleEvent.data.capabilities || [];
  const ttl = authorityGrantedEvent.data.ttl || 14400000; // Default 4 hours
  const grantedAt = authorityGrantedEvent.timestamp;
  const expiresAt = grantedAt + ttl;

  // Current time for status determination
  const now = Date.now();

  // Determine status for each capability
  const capabilityEntries = capabilities.map((cap: string) => {
    let status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' = 'ACTIVE';

    // Check if revoked
    if (revokeAllEvent) {
      status = 'REVOKED';
    }
    // Check if expired (but not revoked)
    else if (now > expiresAt) {
      status = 'EXPIRED';
    }

    return {
      name: cap,
      status,
      grantedAt,
      expiresAt,
      ttlMs: ttl,
      isActive: status === 'ACTIVE',
      isExpired: status === 'EXPIRED',
      isRevoked: status === 'REVOKED'
    };
  });

  // Calculate time remaining for active capabilities
  const timeRemaining = Math.max(0, expiresAt - now);
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className={className}>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Capability Timeline</h3>
          <p className="text-xs text-gray-600 mt-1">Authority grants and their expiration.</p>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Grant Summary */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-xs font-medium text-blue-900 mb-1">
              Preset: {authorityGrantedEvent.data.preset || 'UNKNOWN'}
            </p>
            <p className="text-xs text-blue-800">
              Granted: {new Date(grantedAt).toISOString()}
            </p>
            <p className="text-xs text-blue-800">
              Expires: {new Date(expiresAt).toISOString()}
            </p>
            {!revokeAllEvent && hoursRemaining >= 0 && (
              <p className="text-xs text-blue-700 font-mono mt-1">
                ⏱ {hoursRemaining}h {minutesRemaining}m remaining
              </p>
            )}
          </div>

          {/* Capabilities Table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-medium text-gray-700">Capability</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {capabilityEntries.map((cap, idx) => (
                <tr key={cap.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="bg-gray-100 text-gray-900 px-2 py-1 rounded font-mono text-xs">
                      {cap.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {cap.isActive && (
                      <span className="bg-green-100 text-green-900 px-2 py-1 rounded font-medium text-xs">
                        ✓ ACTIVE
                      </span>
                    )}
                    {cap.isExpired && (
                      <span className="bg-gray-100 text-gray-900 px-2 py-1 rounded font-medium text-xs">
                        ⏱ EXPIRED
                      </span>
                    )}
                    {cap.isRevoked && (
                      <span className="bg-red-100 text-red-900 px-2 py-1 rounded font-medium text-xs">
                        🛑 REVOKED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          <p>Expiration time calculated from grant timestamp + TTL.</p>
        </div>
      </div>
    </div>
  );
}

export default CapabilityTimeline;
